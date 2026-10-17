import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTarget } from '../../src/project.js';
import type { CommandResult, RunCommand } from '../../src/process.js';
import { createEslintSource, parseEslintReport } from '../../src/sources/eslint.js';
import { removeTempProjects, writeProject } from '../helpers.js';

afterEach(removeTempProjects);

function eslintJson(root: string): string {
  return JSON.stringify([
    {
      filePath: path.join(root, 'src', 'stock.ts'),
      messages: [
        {
          ruleId: '@typescript-eslint/no-floating-promises',
          severity: 2,
          message: 'Promises must be awaited',
          line: 28,
          column: 5,
        },
        { ruleId: 'no-console', severity: 1, message: 'Unexpected console', line: 3, column: 1 },
      ],
    },
    {
      filePath: path.join(root, 'src', 'broken.ts'),
      messages: [{ ruleId: null, severity: 2, message: 'Parsing error' }],
    },
  ]);
}

/** A fake runner that records its calls and answers with a fixed result. */
function fakeRunner(result: Partial<CommandResult>): RunCommand & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const run: RunCommand = (command, args, cwd) => {
    calls.push([command, args, cwd]);
    return Promise.resolve({ exitCode: 0, stdout: '[]', stderr: '', ...result });
  };
  return Object.assign(run, { calls });
}

async function projectWithEslint(): Promise<string> {
  return writeProject({
    'package.json': '{}',
    'eslint.config.js': 'export default [];',
    'node_modules/.bin/eslint': '',
  });
}

describe('ESLint source', () => {
  it('runs the project-local ESLint with the JSON formatter and reads its findings', async () => {
    const root = await projectWithEslint();
    const run = fakeRunner({ exitCode: 1, stdout: eslintJson(root) });
    const findings = await createEslintSource(run).find(await loadTarget(root));

    expect(run.calls).toEqual([
      [path.join(root, 'node_modules', '.bin', 'eslint'), ['--format', 'json', '.'], root],
    ]);
    expect(findings).toEqual([
      {
        rule: '@typescript-eslint/no-floating-promises',
        file: 'src/stock.ts',
        line: 28,
        column: 5,
        severity: 'error',
        message: 'Promises must be awaited',
      },
      {
        rule: 'no-console',
        file: 'src/stock.ts',
        line: 3,
        column: 1,
        severity: 'warning',
        message: 'Unexpected console',
      },
      {
        rule: 'eslint',
        file: 'src/broken.ts',
        line: 1,
        column: 1,
        severity: 'error',
        message: 'Parsing error',
      },
    ]);
  });

  it('skips projects without a flat ESLint config', async () => {
    const run = fakeRunner({});
    const root = await writeProject({ 'package.json': '{}' });
    expect(await createEslintSource(run).find(await loadTarget(root))).toEqual([]);
    expect(run.calls).toEqual([]);
  });

  it('explains when the config exists but ESLint is not installed', async () => {
    const root = await writeProject({
      'package.json': '{}',
      'eslint.config.mjs': 'export default [];',
    });
    await expect(createEslintSource(fakeRunner({})).find(await loadTarget(root))).rejects.toThrow(
      'ESLint is not installed',
    );
  });

  it('fails loudly when ESLint itself crashes', async () => {
    const run = fakeRunner({ exitCode: 2, stderr: 'Oops! Something went wrong!\n' });
    const target = await loadTarget(await projectWithEslint());
    await expect(createEslintSource(run).find(target)).rejects.toThrow(
      'ESLint failed: Oops! Something went wrong!',
    );
  });

  it('rejects output that is not an ESLint JSON report', () => {
    expect(() => parseEslintReport('{"oops":true}', '/app')).toThrow('not an array');
  });
});
