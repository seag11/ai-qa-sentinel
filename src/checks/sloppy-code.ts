import { Node, type SourceFile, type Type } from 'ts-morph';
import { findingAtNode, findingAtPos, getComments } from '../ast.js';
import type { Check, Finding, TargetProject } from '../types.js';
import { STUDIES } from './evidence.js';

const ID = 'sloppy-code';
const UNFINISHED_COMMENT = /\b(TODO|FIXME|XXX)\b/;
const STUB_MESSAGE = /not (yet )?implemented|implement me|^todo\b/i;

/** The "silly mistake" and "incomplete code" categories: code that compiles but was never finished. */
export function createSloppyCodeCheck(): Check {
  return {
    id: ID,
    description: 'Identical branches, swallowed errors, floating promises and unfinished stubs',
    evidence: [STUDIES.tambon],
    run(project) {
      return Promise.resolve(project.sourceFiles.flatMap((file) => scanFile(project, file)));
    },
  };
}

function scanFile(project: TargetProject, file: SourceFile): Finding[] {
  const findings: Finding[] = [];
  const comments = getComments(file);
  const report = (node: Node, severity: Finding['severity'], message: string): void => {
    findings.push(findingAtNode(project, node, { checkId: ID, severity, message }));
  };

  file.forEachDescendant((node) => {
    if (Node.isIfStatement(node)) {
      const otherwise = node.getElseStatement();
      if (
        otherwise &&
        !Node.isIfStatement(otherwise) &&
        sameCode(node.getThenStatement(), otherwise)
      ) {
        report(node, 'warning', 'if and else branches are identical');
      }
    } else if (Node.isConditionalExpression(node)) {
      if (sameCode(node.getWhenTrue(), node.getWhenFalse())) {
        report(node, 'warning', 'both sides of the ternary are identical');
      }
    } else if (Node.isCatchClause(node)) {
      const block = node.getBlock();
      if (
        block.getStatements().length === 0 &&
        comments.every((comment) => !within(block, comment.pos))
      ) {
        report(node, 'warning', 'empty catch block swallows the error');
      }
    } else if (Node.isExpressionStatement(node)) {
      const expression = node.getExpression();
      if (Node.isCallExpression(expression) && isFloatingPromise(expression)) {
        report(
          expression,
          'error',
          `promise from ${calleeName(expression)}() is never awaited; errors and ordering are lost`,
        );
      }
    } else if (Node.isThrowStatement(node)) {
      const stub = stubMessage(node.getExpression());
      if (stub !== undefined) report(node, 'warning', `unfinished stub: throws '${stub}'`);
    }
  });

  for (const comment of comments) {
    const match = UNFINISHED_COMMENT.exec(comment.text);
    if (match) {
      findings.push(
        findingAtPos(project, file, comment.pos, {
          checkId: ID,
          severity: 'warning',
          message: `unfinished: ${match[1] ?? 'TODO'} comment left in code`,
        }),
      );
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

function sameCode(a: Node, b: Node): boolean {
  const normalize = (node: Node): string => node.getText().replace(/\s+/g, '');
  return normalize(a) === normalize(b);
}

function within(node: Node, pos: number): boolean {
  return pos > node.getStart() && pos < node.getEnd();
}

function isFloatingPromise(call: Node & { getExpression(): Node }): boolean {
  if (!isPromiseLike(call.getType())) return false;
  // `.catch(handler)` and `.then(onOk, onError)` deliberately handle the rejection.
  const callee = call.getExpression();
  if (Node.isPropertyAccessExpression(callee) && Node.isCallExpression(call)) {
    const name = callee.getName();
    if (name === 'catch') return false;
    if (name === 'then' && call.getArguments().length >= 2) return false;
  }
  return true;
}

function isPromiseLike(type: Type): boolean {
  if (type.isUnion()) return type.getUnionTypes().some(isPromiseLike);
  return type.getProperty('then') !== undefined;
}

function calleeName(call: Node & { getExpression(): Node }): string {
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
}

function stubMessage(thrown: Node): string | undefined {
  if (!Node.isNewExpression(thrown)) return undefined;
  const [first] = thrown.getArguments();
  if (!first || !Node.isStringLiteral(first)) return undefined;
  const text = first.getLiteralText();
  return STUB_MESSAGE.test(text) ? text : undefined;
}
