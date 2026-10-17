import { describe, expect, it } from 'vitest';
import { EXIT, runCli, USAGE } from '../src/commands.js';
import { fakeRegistry } from './helpers.js';

const realPackages = [
  'fastify',
  '@types/node',
  'typescript',
  'vitest',
  'tsx',
  'eslint',
  '@eslint/js',
  'typescript-eslint',
];

async function cli(...argv: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const code = await runCli(argv, {
    write: (text) => (output += text),
    registry: fakeRegistry(realPackages),
  });
  return { code, output };
}

describe('sentinel CLI', () => {
  it('prints one line per finding and a summary, exiting 1', async () => {
    const { code, output } = await cli('scan', 'examples/slop-shop');
    expect(code).toBe(EXIT.findings);
    expect(output).toMatch(/phantom-import\s+src\/pay\.ts:24\s+'stripe-helpers-pro' is not on npm/);
    expect(output).toMatch(/\d+ findings · \d+\.\ds/);
  });

  it('prints JSON with --json', async () => {
    const { output } = await cli('scan', 'examples/slop-shop', '--json', '--offline');
    const parsed = JSON.parse(output) as { findings: { rule: string }[] };
    expect(parsed.findings.map((finding) => finding.rule)).toContain('phantom-import');
  });

  it('exits 0 for a clean project', async () => {
    const { code, output } = await cli('scan', 'test/fixtures/clean', '--offline');
    expect(code).toBe(EXIT.clean);
    expect(output).toContain('0 findings');
  });

  it('shows usage for --help, and for bad input with exit code 2', async () => {
    expect(await cli('--help')).toEqual({ code: EXIT.clean, output: USAGE });
    expect((await cli()).code).toBe(EXIT.usage);
    expect((await cli('fix', 'x')).code).toBe(EXIT.usage);
    expect((await cli('scan', '--bogus')).code).toBe(EXIT.usage);
    expect(await cli('scan', 'no/such/dir')).toEqual({
      code: EXIT.usage,
      output: 'No such directory: no/such/dir',
    });
  });
});
