import { styleText } from 'node:util';
import type { ScanResult } from './scan.js';
import type { Finding } from './types.js';

const COLOR: Record<Finding['severity'], 'red' | 'yellow'> = { error: 'red', warning: 'yellow' };

/** The human-readable report: one aligned line per finding, then a summary. */
export function formatText(target: string, result: ScanResult): string {
  const { findings } = result;
  const locations = findings.map((finding) => `${finding.file}:${finding.line}`);
  const ruleWidth = Math.max(0, ...findings.map((finding) => finding.rule.length)) + 2;
  const locationWidth = Math.max(0, ...locations.map((location) => location.length)) + 2;

  const lines = [styleText('bold', `sentinel scan ${target}`), ''];
  findings.forEach((finding, index) => {
    const rule = styleText(COLOR[finding.severity], finding.rule.padEnd(ruleWidth));
    const location = styleText('dim', (locations[index] ?? '').padEnd(locationWidth));
    lines.push(`  ${rule}${location}${finding.message}`);
  });
  if (findings.length > 0) lines.push('');

  const seconds = (result.durationMs / 1000).toFixed(1);
  lines.push(`${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} · ${seconds}s`);
  return lines.join('\n');
}

export function formatJson(result: ScanResult): string {
  return JSON.stringify(
    { findings: result.findings, durationMs: Math.round(result.durationMs) },
    null,
    2,
  );
}
