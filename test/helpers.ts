import { Project, ts, type CompilerOptions } from 'ts-morph';
import { createTarget } from '../src/project.js';
import type { LookupResult, PackageRegistry } from '../src/registry.js';
import type { Check, Finding, TargetProject } from '../src/types.js';

export const FASTIFY_TYPES = `
declare module 'fastify' {
  export interface FastifyInstance {
    get(path: string, ...rest: unknown[]): void;
    post(path: string, ...rest: unknown[]): void;
    put(path: string, ...rest: unknown[]): void;
    route(options: unknown): void;
  }
  export default function Fastify(): FastifyInstance;
}`;

/** Builds a scan target from source text alone, so each test shows exactly the code it judges. */
export function inMemoryTarget(
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
  compilerOptions: CompilerOptions = {},
): TargetProject {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts'],
      ...compilerOptions,
    },
  });
  for (const [name, text] of Object.entries(files)) project.createSourceFile(`/app/${name}`, text);
  return createTarget('/app', project, {
    name: 'app',
    dependencies: new Map(Object.entries(dependencies)),
  });
}

export async function runCheck(
  check: Check,
  files: Record<string, string>,
  dependencies?: Record<string, string>,
): Promise<Finding[]> {
  return check.run(inMemoryTarget(files, dependencies));
}

export function messages(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.message);
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const NOW = new Date('2026-10-17T00:00:00Z');

export function fakeRegistry(
  packages: Record<string, { ageDays: number; weeklyDownloads: number } | 'unknown'>,
): PackageRegistry {
  return {
    lookup(name): Promise<LookupResult> {
      const entry = packages[name];
      if (entry === undefined) return Promise.resolve({ status: 'missing' });
      if (entry === 'unknown') return Promise.resolve({ status: 'unknown' });
      const createdAt = new Date(NOW.getTime() - entry.ageDays * DAY_MS);
      return Promise.resolve({
        status: 'found',
        info: { createdAt, weeklyDownloads: entry.weeklyDownloads },
      });
    },
  };
}
