import type { Finding, FindingSource, TargetProject } from './types.js';

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly durationMs: number;
}

/** Runs every source and returns findings grouped by source, then ordered by location. */
export async function scan(
  project: TargetProject,
  sources: readonly FindingSource[],
): Promise<ScanResult> {
  const started = performance.now();
  const perSource = await Promise.all(sources.map((source) => source.find(project)));
  const findings = perSource.flatMap((findings) => [...findings].sort(byLocation));
  return { findings, durationMs: performance.now() - started };
}

function byLocation(a: Finding, b: Finding): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}
