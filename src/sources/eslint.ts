import { existsSync } from 'node:fs';
import path from 'node:path';
import { isRecord } from '../guards.js';
import { runCommand, type RunCommand } from '../process.js';
import type { Finding, FindingSource } from '../types.js';

const CONFIG_FILES = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'].map((ext) => `eslint.config.${ext}`);

/**
 * Reads findings from the project's own ESLint setup, so Sentinel never re-implements a lint rule.
 * Projects without a flat ESLint config are skipped.
 */
export function createEslintSource(run: RunCommand = runCommand): FindingSource {
  return {
    id: 'eslint',
    async find(project) {
      if (!CONFIG_FILES.some((name) => existsSync(path.join(project.root, name)))) return [];

      const eslint = path.join(project.root, 'node_modules', '.bin', 'eslint');
      if (!existsSync(eslint)) {
        throw new Error(`${project.root} has an ESLint config but ESLint is not installed`);
      }
      const { exitCode, stdout, stderr } = await run(
        eslint,
        ['--format', 'json', '.'],
        project.root,
      );
      // ESLint exits 1 when it reports problems and 2 when it could not run.
      if (exitCode > 1) throw new Error(`ESLint failed: ${stderr.trim()}`);
      return parseEslintReport(stdout, project.root);
    },
  };
}

/** Converts ESLint's JSON formatter output into findings. */
export function parseEslintReport(json: string, root: string): Finding[] {
  const report: unknown = JSON.parse(json);
  if (!Array.isArray(report)) throw new Error('ESLint report is not an array');

  return report.filter(isRecord).flatMap((result) => {
    const filePath = typeof result.filePath === 'string' ? result.filePath : '';
    const file = path.relative(root, filePath).split(path.sep).join('/');
    const messages = Array.isArray(result.messages) ? result.messages.filter(isRecord) : [];
    return messages.map((message): Finding => ({
      // A null rule id means ESLint could not parse the file.
      rule: typeof message.ruleId === 'string' ? message.ruleId : 'eslint',
      file,
      line: typeof message.line === 'number' ? message.line : 1,
      column: typeof message.column === 'number' ? message.column : 1,
      severity: message.severity === 2 ? 'error' : 'warning',
      message: typeof message.message === 'string' ? message.message : '',
    }));
  });
}
