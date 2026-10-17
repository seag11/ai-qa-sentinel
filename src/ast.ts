import path from 'node:path';
import { ts, type Node, type SourceFile } from 'ts-morph';
import type { Finding, Severity, TargetProject } from './types.js';

interface FindingFields {
  readonly checkId: string;
  readonly severity: Severity;
  readonly message: string;
}

export function findingAtNode(project: TargetProject, node: Node, fields: FindingFields): Finding {
  return findingAtPos(project, node.getSourceFile(), node.getStart(), fields);
}

export function findingAtPos(
  project: TargetProject,
  sourceFile: SourceFile,
  pos: number,
  fields: FindingFields,
): Finding {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { ...fields, file: relativePath(project, sourceFile), line, column };
}

export function relativePath(project: TargetProject, sourceFile: SourceFile): string {
  return path.relative(project.root, sourceFile.getFilePath()).split(path.sep).join('/');
}

export interface Comment {
  readonly pos: number;
  readonly text: string;
}

/** Every comment in the file, in order. Strings that merely look like comments are not included. */
export function getComments(sourceFile: SourceFile): Comment[] {
  const text = sourceFile.getFullText();
  const compilerFile = sourceFile.compilerNode;
  const byPos = new Map<number, Comment>();

  const visit = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ];
    for (const range of ranges) {
      byPos.set(range.pos, { pos: range.pos, text: text.slice(range.pos, range.end) });
    }
    for (const child of node.getChildren(compilerFile)) visit(child);
  };
  visit(compilerFile);

  return [...byPos.values()].sort((a, b) => a.pos - b.pos);
}

/** Strips parentheses, `as`, `!` and `satisfies` wrappers so checks see the underlying expression. */
export function unwrapExpression(node: Node): Node {
  let current = node;
  for (;;) {
    if (
      current.isKind(ts.SyntaxKind.ParenthesizedExpression) ||
      current.isKind(ts.SyntaxKind.AsExpression) ||
      current.isKind(ts.SyntaxKind.NonNullExpression) ||
      current.isKind(ts.SyntaxKind.SatisfiesExpression)
    ) {
      current = current.getExpression();
    } else {
      return current;
    }
  }
}
