import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTarget, parseManifest } from '../src/project.js';
import { removeTempProjects, writeProject } from './helpers.js';

afterEach(removeTempProjects);

describe('loadTarget', () => {
  it('scans the files tsconfig.json includes, leaving out declaration files', async () => {
    const root = await writeProject({
      'package.json': JSON.stringify({ name: 'shop', dependencies: { fastify: '^5' } }),
      'tsconfig.json': JSON.stringify({
        include: ['src'],
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
      'src/app.ts': '',
      'src/shims.d.ts': '',
      'scripts/seed.ts': '',
    });
    const target = await loadTarget(root);
    expect(target.files.map((file) => path.relative(root, file))).toEqual(['src/app.ts']);
    expect(target.packageName).toBe('shop');
    expect(target.dependencies).toEqual(new Map([['fastify', '^5']]));
    expect(target.pathAliases).toEqual(['@/*']);
  });

  it('without a tsconfig.json, scans every TypeScript file outside node_modules', async () => {
    const root = await writeProject({
      'a.ts': '',
      'lib/b.mts': '',
      'node_modules/dep/index.ts': '',
    });
    const target = await loadTarget(root);
    expect(target.files.map((file) => path.relative(root, file)).sort()).toEqual([
      'a.ts',
      'lib/b.mts',
    ]);
    expect(target.packageName).toBeUndefined();
  });
});

describe('parseManifest', () => {
  it('merges every dependency field and ignores malformed entries', () => {
    const manifest = parseManifest(
      JSON.stringify({
        dependencies: { a: '^1' },
        devDependencies: { b: '^2', broken: 3 },
        peerDependencies: 'not an object',
      }),
    );
    expect(manifest).toEqual({
      name: undefined,
      dependencies: new Map([
        ['a', '^1'],
        ['b', '^2'],
      ]),
    });
  });

  it('treats a non-object manifest as empty', () => {
    expect(parseManifest('[]')).toEqual({ name: undefined, dependencies: new Map() });
  });
});
