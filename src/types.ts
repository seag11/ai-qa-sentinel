export type Severity = 'error' | 'warning';

export interface Finding {
  /** The rule that produced it: `phantom-import`, or an ESLint rule id. */
  readonly rule: string;
  /** Path relative to the scanned project's root, with forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: Severity;
  readonly message: string;
}

/** The project being scanned, as its tsconfig.json and package.json describe it. */
export interface TargetProject {
  readonly root: string;
  /** Absolute paths of the TypeScript files to scan; declaration files are left out. */
  readonly files: readonly string[];
  readonly packageName: string | undefined;
  /** Dependency name to version spec, across all dependency fields of package.json. */
  readonly dependencies: ReadonlyMap<string, string>;
  /** Import patterns from tsconfig `paths`, such as `@/*`. */
  readonly pathAliases: readonly string[];
}

/** Anything that reports findings: a built-in check or an adapter for an existing tool. */
export interface FindingSource {
  readonly id: string;
  find(project: TargetProject): Promise<Finding[]>;
}
