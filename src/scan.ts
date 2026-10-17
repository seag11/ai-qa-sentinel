import type { Check, Finding, TargetProject } from './types.js';

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly durationMs: number;
}

/** Runs every check and returns findings grouped by check, then ordered by location. */
export async function scan(project: TargetProject, checks: readonly Check[]): Promise<ScanResult> {
  const started = performance.now();
  const perCheck = await Promise.all(checks.map((check) => check.run(project)));
  const findings = perCheck.flatMap((findings) =>
    [...findings].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    ),
  );
  return { findings, durationMs: performance.now() - started };
}
