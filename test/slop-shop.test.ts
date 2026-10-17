import { describe, expect, it } from 'vitest';
import { loadTarget } from '../src/project.js';
import { scan } from '../src/scan.js';
import { createSources } from '../src/sources/index.js';
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

/** The phase 1 exit gate: every seeded bug in the demo app is found, and nothing else. */
describe('scanning examples/slop-shop', () => {
  it('finds exactly the seeded bugs', async () => {
    const target = await loadTarget('examples/slop-shop');
    const { findings } = await scan(
      target,
      createSources({ registry: fakeRegistry(realPackages) }),
    );

    expect(findings.map(({ rule, file, line }) => `${rule} ${file}:${line}`)).toEqual([
      'phantom-import src/pay.ts:24',
      '@typescript-eslint/no-deprecated src/files.ts:3',
      '@typescript-eslint/no-floating-promises src/stock.ts:34',
      '@typescript-eslint/no-unsafe-call src/user.ts:10',
      '@typescript-eslint/no-explicit-any src/user.ts:10',
      '@typescript-eslint/no-unsafe-member-access src/user.ts:10',
    ]);
  });
});
