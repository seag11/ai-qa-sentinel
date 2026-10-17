import { afterEach, describe, expect, it } from 'vitest';
import { createPhantomImportSource } from '../../src/sources/phantom-import.js';
import { fakeRegistry, projectWith, removeTempProjects, writeProject } from '../helpers.js';
import { loadTarget } from '../../src/project.js';

const registry = fakeRegistry(['fastify', '@fastify/cors', 'zod']);
const source = createPhantomImportSource(registry);

afterEach(removeTempProjects);

async function messagesFor(
  files: Record<string, string>,
  dependencies?: Record<string, string>,
  using = source,
): Promise<string[]> {
  const findings = await using.find(await projectWith(files, dependencies));
  return findings.map((finding) => finding.message);
}

describe('phantom-import', () => {
  it('flags a package that does not exist on npm, with its location', async () => {
    const project = await projectWith({
      'src/pay.ts': `\nimport { charge } from 'stripe-helpers-pro';`,
    });
    expect(await source.find(project)).toEqual([
      {
        rule: 'phantom-import',
        file: 'src/pay.ts',
        line: 2,
        column: 24,
        severity: 'error',
        message: `'stripe-helpers-pro' is not on npm`,
      },
    ]);
  });

  it('finds dynamic imports, require calls, re-exports and import-equals', async () => {
    const messages = await messagesFor({
      'a.ts': `export async function f() { return import('ghost-a'); }`,
      'b.ts': `declare const require: (id: string) => unknown;\nrequire('ghost-b');`,
      'c.ts': `export * from 'ghost-c';`,
      'd.ts': `import legacy = require('ghost-d');`,
    });
    expect(messages.sort()).toEqual([
      `'ghost-a' is not on npm`,
      `'ghost-b' is not on npm`,
      `'ghost-c' is not on npm`,
      `'ghost-d' is not on npm`,
    ]);
  });

  it('flags a real package that package.json does not declare', async () => {
    expect(await messagesFor({ 'a.ts': `import { z } from 'zod';` })).toEqual([
      `'zod' is imported but not declared in package.json`,
    ]);
  });

  it('accepts declared packages, including scoped deep imports', async () => {
    const messages = await messagesFor(
      { 'a.ts': `import Fastify from 'fastify';\nimport cors from '@fastify/cors/plugin';` },
      { fastify: '^5.0.0', '@fastify/cors': '^10.0.0' },
    );
    expect(messages).toEqual([]);
  });

  it('ignores relative paths, Node built-ins, subpath imports and the package itself', async () => {
    const messages = await messagesFor({
      'a.ts': [
        `import './b.js';`,
        `import fs from 'fs';`,
        `import path from 'node:path';`,
        `import { x } from '#internal';`,
        `import { y } from 'app/utils';`,
      ].join('\n'),
    });
    expect(messages).toEqual([]);
  });

  it('ignores tsconfig path aliases', async () => {
    const root = await writeProject({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'], config: ['./src/config.ts'] } },
      }),
      'src/a.ts': `import { db } from '@/db';\nimport config from 'config';`,
    });
    expect(await source.find(await loadTarget(root))).toEqual([]);
  });

  it('skips workspace and file dependencies, which are not on the public registry', async () => {
    const messages = await messagesFor(
      { 'a.ts': `import { a } from 'shared-lib';\nimport { b } from 'vendored';` },
      { 'shared-lib': 'workspace:*', vendored: 'file:../vendored' },
    );
    expect(messages).toEqual([]);
  });

  it('accepts a type-only import satisfied by an @types package', async () => {
    const messages = await messagesFor(
      { 'a.ts': `import type { Request } from 'express';` },
      { '@types/express': '^5.0.0' },
      createPhantomImportSource(),
    );
    expect(messages).toEqual([]);
  });

  it('offline, flags only undeclared packages', async () => {
    const messages = await messagesFor(
      { 'a.ts': `import 'declared-ghost';\nimport 'undeclared-pkg';` },
      { 'declared-ghost': '^1.0.0' },
      createPhantomImportSource(),
    );
    expect(messages).toEqual([`'undeclared-pkg' is imported but not declared in package.json`]);
  });

  it('stays silent about a declared package when the registry cannot be reached', async () => {
    const unreachable = createPhantomImportSource(fakeRegistry([], ['flaky']));
    expect(
      await messagesFor({ 'a.ts': `import 'flaky';` }, { flaky: '^1.0.0' }, unreachable),
    ).toEqual([]);
  });
});
