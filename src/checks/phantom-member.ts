import { Node, ts, type SourceFile, type Type } from 'ts-morph';
import { findingAtNode, findingAtPos, getComments } from '../ast.js';
import type { Check, Finding, TargetProject } from '../types.js';
import { STUDIES } from './evidence.js';

const ID = 'phantom-member';
const SUPPRESSION = /@ts-(ignore|nocheck)\b/;

/**
 * TypeScript already rejects most invented methods and attributes. This check finds the escape
 * hatches that let them through: `any`, suppression comments, and untyped JSON.
 */
export function createPhantomMemberCheck(): Check {
  return {
    id: ID,
    description: 'Type-checker escape hatches that hide invented functions and attributes',
    evidence: [STUDIES.tambon],
    run(project) {
      return Promise.resolve(project.sourceFiles.flatMap((file) => scanFile(project, file)));
    },
  };
}

function scanFile(project: TargetProject, file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const report = (node: Node, severity: Finding['severity'], message: string): void => {
    findings.push(findingAtNode(project, node, { checkId: ID, severity, message }));
  };

  file.forEachDescendant((node) => {
    if (node.isKind(ts.SyntaxKind.AnyKeyword)) {
      const assertion = node.getParent();
      if (Node.isAsExpression(assertion) || Node.isTypeAssertion(assertion)) {
        const hidden = findHiddenMember(assertion);
        if (hidden) report(assertion, 'error', hidden);
        else
          report(
            assertion,
            'warning',
            `'as any' turns off type checking for ${preview(assertion.getExpression())}`,
          );
      } else {
        report(node, 'warning', `explicit 'any' type ${describeOwner(node)}`);
      }
    } else if (isUntypedJsonParse(node)) {
      report(
        node,
        'warning',
        'JSON.parse result is used untyped; validate it or annotate it as unknown',
      );
    }
  });

  for (const comment of getComments(file)) {
    const match = SUPPRESSION.exec(comment.text);
    if (match) {
      findings.push(
        findingAtPos(project, file, comment.pos, {
          checkId: ID,
          severity: 'warning',
          message: `'@ts-${match[1] ?? 'ignore'}' hides type errors; prefer @ts-expect-error with a reason`,
        }),
      );
    }
  }
  return findings;
}

/** `(user as any).fullName()` where the real type of `user` has no `fullName`. */
function findHiddenMember(assertion: Node & { getExpression(): Node }): string | undefined {
  let outer: Node = assertion;
  while (Node.isParenthesizedExpression(outer.getParent())) outer = outer.getParentOrThrow();
  const access = outer.getParent();
  if (!Node.isPropertyAccessExpression(access) || access.getExpression() !== outer)
    return undefined;

  const inner = assertion.getExpression();
  const realType = inner.getType();
  const member = access.getName();
  if (!isInspectable(realType) || hasMember(realType, member)) return undefined;

  const isCall = Node.isCallExpression(access.getParent());
  const usage = `${preview(inner)}.${member}${isCall ? '()' : ''}`;
  return `'as any' hides ${isCall ? 'call to ' : ''}${usage}, which does not exist on ${realType.getText(inner)}`;
}

function isInspectable(type: Type): boolean {
  return !type.isAny() && !type.isUnknown() && (type.isObject() || type.isIntersection());
}

function hasMember(type: Type, name: string): boolean {
  return (
    type.getProperty(name) !== undefined ||
    type.getStringIndexType() !== undefined ||
    type.getApparentType().getProperty(name) !== undefined
  );
}

function isUntypedJsonParse(node: Node): boolean {
  if (!Node.isCallExpression(node) || node.getExpression().getText() !== 'JSON.parse') return false;
  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent)) return parent.getTypeNode() === undefined;
  return Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent);
}

function describeOwner(anyKeyword: Node): string {
  const owner = anyKeyword.getFirstAncestor(
    (ancestor) =>
      Node.isParameterDeclaration(ancestor) ||
      Node.isVariableDeclaration(ancestor) ||
      Node.isPropertySignature(ancestor) ||
      Node.isPropertyDeclaration(ancestor) ||
      Node.isFunctionLikeDeclaration(ancestor),
  );
  return owner && Node.hasName(owner) ? `on '${owner.getName()}'` : 'disables type checking';
}

function preview(node: Node): string {
  const text = node.getText().replace(/\s+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}
