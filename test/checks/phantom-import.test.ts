import { describe, expect, it } from 'vitest';
import { createPhantomImportCheck } from '../../src/checks/phantom-import.js';
import { fakeRegistry, inMemoryTarget, messages, NOW, runCheck } from '../helpers.js';

const healthy = { ageDays: 3000, weeklyDownloads: 5_000_000 };
const registry = fakeRegistry({ fastify: healthy, '@fastify/cors': healthy, zod: healthy });
const check = createPhantomImportCheck({ registry, now: () => NOW });

describe('phantom-import', () => {
  it('flags a package that does not exist on npm', async () => {
    const findings = await runCheck(check, {
      'pay.ts': `import { charge } from 'stripe-helpers-pro';`,
    });
    expect(findings).toMatchObject([
      { checkId: 'phantom-import', file: 'pay.ts', line: 1, severity: 'error' },
    ]);
    expect(messages(findings)).toEqual([`'stripe-helpers-pro' is not on npm`]);
  });

  it('flags dynamic imports, require calls and re-exports too', async () => {
    const findings = await runCheck(check, {
      'a.ts': `export async function f() { return import('ghost-a'); }`,
      'b.ts': `declare const require: (id: string) => unknown; require('ghost-b');`,
      'c.ts': `export * from 'ghost-c';`,
      'd.ts': `import legacy = require('ghost-d');`,
    });
    expect(messages(findings)).toEqual([
      `'ghost-a' is not on npm`,
      `'ghost-b' is not on npm`,
      `'ghost-c' is not on npm`,
      `'ghost-d' is not on npm`,
    ]);
  });

  it('flags a real package that package.json does not declare', async () => {
    const findings = await runCheck(check, { 'a.ts': `import { z } from 'zod';` });
    expect(messages(findings)).toEqual([`'zod' is imported but not declared in package.json`]);
  });

  it('warns about packages that are brand new or barely downloaded', async () => {
    const suspicious = createPhantomImportCheck({
      registry: fakeRegistry({
        'fresh-pkg': { ageDays: 4, weeklyDownloads: 10_000 },
        'quiet-pkg': { ageDays: 900, weeklyDownloads: 12 },
      }),
      now: () => NOW,
    });
    const findings = await runCheck(
      suspicious,
      { 'a.ts': `import 'fresh-pkg';\nimport 'quiet-pkg';` },
      { 'fresh-pkg': '^1.0.0', 'quiet-pkg': '^1.0.0' },
    );
    expect(findings.map((f) => f.severity)).toEqual(['warning', 'warning']);
    expect(messages(findings)[0]).toContain('first published 4 days ago');
    expect(messages(findings)[1]).toContain('12 downloads last week');
  });

  it('accepts declared, established packages including scoped deep imports', async () => {
    const findings = await runCheck(
      check,
      { 'a.ts': `import Fastify from 'fastify';\nimport cors from '@fastify/cors/plugin';` },
      { fastify: '^5.0.0', '@fastify/cors': '^10.0.0' },
    );
    expect(findings).toEqual([]);
  });

  it('ignores relative paths, Node built-ins, subpath imports and the package itself', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        `import './b.js';`,
        `import fs from 'fs';`,
        `import path from 'node:path';`,
        `import { x } from '#internal';`,
        `import { y } from 'app/utils';`,
      ].join('\n'),
    });
    expect(findings).toEqual([]);
  });

  it('skips workspace and file dependencies, which are not on the public registry', async () => {
    const findings = await runCheck(
      check,
      { 'a.ts': `import { a } from 'shared-lib';\nimport { b } from 'vendored';` },
      { 'shared-lib': 'workspace:*', vendored: 'file:../vendored' },
    );
    expect(findings).toEqual([]);
  });

  it('accepts a type-only import satisfied by an @types package', async () => {
    const findings = await runCheck(
      createPhantomImportCheck(),
      { 'a.ts': `import type { Request } from 'express';` },
      { '@types/express': '^5.0.0' },
    );
    expect(findings).toEqual([]);
  });

  it('offline, still flags undeclared packages but cannot judge declared ones', async () => {
    const offline = createPhantomImportCheck();
    const findings = await runCheck(
      offline,
      { 'a.ts': `import 'declared-pkg';\nimport 'undeclared-pkg';` },
      { 'declared-pkg': '^1.0.0' },
    );
    expect(messages(findings)).toEqual([
      `'undeclared-pkg' is imported but not declared in package.json`,
    ]);
  });

  it('stays silent when the registry cannot be reached', async () => {
    const unreachable = createPhantomImportCheck({ registry: fakeRegistry({ x: 'unknown' }) });
    const findings = await runCheck(unreachable, { 'a.ts': `import 'x';` }, { x: '^1.0.0' });
    expect(findings).toEqual([]);
  });

  it('ignores tsconfig path aliases', async () => {
    const target = inMemoryTarget(
      { 'a.ts': `import { db } from '@/db';\nimport config from 'config';` },
      {},
      { baseUrl: '.', paths: { '@/*': ['src/*'], config: ['src/config.ts'] } },
    );
    expect(await check.run(target)).toEqual([]);
  });
});
