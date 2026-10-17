import { Node, ts, type SourceFile } from 'ts-morph';
import { findingAtPos } from '../ast.js';
import type { Check, Finding, TargetProject } from '../types.js';
import { STUDIES } from './evidence.js';

const ID = 'deprecated-api';

/**
 * Relies on the type checker's own deprecation reports (the strikethrough an editor shows), so any
 * API tagged `@deprecated` in its typings is covered, from Node built-ins to third-party packages.
 */
export function createDeprecatedApiCheck(): Check {
  return {
    id: ID,
    description: 'Calls to APIs their typings mark @deprecated',
    evidence: [STUDIES.wang],
    run(project) {
      return Promise.resolve(project.sourceFiles.flatMap((file) => scanFile(project, file)));
    },
  };
}

function scanFile(project: TargetProject, file: SourceFile): Finding[] {
  const service = project.ts.getLanguageService().compilerObject;
  return service
    .getSuggestionDiagnostics(file.getFilePath())
    .filter((diagnostic) => diagnostic.reportsDeprecated !== undefined)
    .filter((diagnostic) => !isImportOrExport(file, diagnostic.start))
    .map((diagnostic) => {
      const start = diagnostic.start;
      return findingAtPos(project, file, start, {
        checkId: ID,
        severity: 'warning',
        message: describeDeprecation(file, start, diagnostic),
      });
    });
}

/** Importing a deprecated name is not the problem; each use of it is reported instead. */
function isImportOrExport(file: SourceFile, start: number): boolean {
  const node = file.getDescendantAtPos(start);
  return (
    node?.getFirstAncestor(
      (ancestor) => Node.isImportDeclaration(ancestor) || Node.isExportDeclaration(ancestor),
    ) !== undefined
  );
}

function describeDeprecation(file: SourceFile, start: number, diagnostic: ts.Diagnostic): string {
  const node = file.getDescendantAtPos(start);
  if (!node) return ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');

  const call = callAround(node);
  const name = call
    ? `${Node.isNewExpression(call) ? 'new ' : ''}${call.getExpression().getText()}()`
    : node.getText();
  const note = deprecationNote(node, call);
  return note ? `${name} is deprecated: ${note}` : `${name} is deprecated`;
}

/** The call or `new` expression whose callee ends at this identifier, if any. */
function callAround(identifier: Node): (Node & { getExpression(): Node }) | undefined {
  let callee: Node = identifier;
  const parent = identifier.getParent();
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier)
    callee = parent;
  const candidate = callee.getParent();
  if (
    (Node.isCallExpression(candidate) || Node.isNewExpression(candidate)) &&
    candidate.getExpression() === callee
  ) {
    return candidate;
  }
  return undefined;
}

function deprecationNote(identifier: Node, call: Node | undefined): string | undefined {
  const checker = identifier.getProject().getTypeChecker().compilerObject;
  const declarations: ts.Node[] = [];

  if (call && (ts.isCallExpression(call.compilerNode) || ts.isNewExpression(call.compilerNode))) {
    const declaration = checker.getResolvedSignature(call.compilerNode)?.getDeclaration();
    if (declaration) declarations.push(declaration);
  }
  declarations.push(
    ...(identifier
      .getSymbol()
      ?.getDeclarations()
      .map((d) => d.compilerNode) ?? []),
  );

  for (const declaration of declarations) {
    const tag = ts.getJSDocDeprecatedTag(declaration);
    if (tag) return cleanComment(ts.getTextOfJSDocComment(tag.comment));
  }
  return undefined;
}

function cleanComment(comment: string | undefined): string | undefined {
  const text = comment?.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return text === '' ? undefined : text;
}
