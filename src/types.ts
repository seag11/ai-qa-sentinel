import type { Project, SourceFile } from 'ts-morph';

export type Severity = 'error' | 'warning';

export interface Finding {
  readonly checkId: string;
  /** Path relative to the scanned project's root, with forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: Severity;
  readonly message: string;
}

/** A published study that motivates a check. */
export interface Evidence {
  readonly citation: string;
  readonly url: string;
}

/** The code being scanned: its TypeScript program plus what its package.json declares. */
export interface TargetProject {
  readonly root: string;
  readonly ts: Project;
  readonly sourceFiles: readonly SourceFile[];
  readonly packageName: string | undefined;
  /** Dependency name to version spec, across all dependency fields of package.json. */
  readonly dependencies: ReadonlyMap<string, string>;
}

export interface Check {
  readonly id: string;
  readonly description: string;
  readonly evidence: readonly Evidence[];
  run(project: TargetProject): Promise<Finding[]>;
}
