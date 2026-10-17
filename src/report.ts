import { styleText } from 'node:util';
import type { ScanResult } from './scan.js';
import type { Check, Finding } from './types.js';

const COLOR: Record<Finding['severity'], 'red' | 'yellow'> = { error: 'red', warning: 'yellow' };

/** The human-readable report: one line per finding, then the studies behind the checks that fired. */
export function formatText(target: string, result: ScanResult, checks: readonly Check[]): string {
  const { findings } = result;
  const lines = [styleText('bold', `sentinel scan ${target}`), ''];

  const idWidth = Math.max(...checks.map((check) => check.id.length)) + 2;
  const locations = findings.map((finding) => `${finding.file}:${finding.line}`);
  const locationWidth = Math.max(0, ...locations.map((location) => location.length)) + 2;

  findings.forEach((finding, index) => {
    const id = styleText(COLOR[finding.severity], finding.checkId.padEnd(idWidth));
    const location = styleText('dim', (locations[index] ?? '').padEnd(locationWidth));
    lines.push(`  ${id}${location}${finding.message}`);
  });

  if (findings.length > 0) lines.push('');
  const seconds = (result.durationMs / 1000).toFixed(1);
  lines.push(`${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} · ${seconds}s`);

  const fired = checks.filter((check) => findings.some((finding) => finding.checkId === check.id));
  if (fired.length > 0) {
    lines.push('', styleText('bold', 'Why these checks:'));
    for (const check of fired) {
      const citations = check.evidence.map((study) => study.citation).join('; ');
      lines.push(`  ${check.id.padEnd(idWidth)}${styleText('dim', citations)}`);
    }
  }
  return lines.join('\n');
}

export function formatJson(result: ScanResult): string {
  return JSON.stringify(
    { findings: result.findings, durationMs: Math.round(result.durationMs) },
    null,
    2,
  );
}
