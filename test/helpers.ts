import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadTarget } from '../src/project.js';
import type { LookupResult, PackageRegistry } from '../src/registry.js';
import type { TargetProject } from '../src/types.js';

const tempRoots: string[] = [];

/** Writes files into a fresh temp directory and returns its path. Pair with `removeTempProjects`. */
export async function writeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-test-'));
  tempRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const filePath = path.join(root, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, text);
  }
  return root;
}

/** A project on disk with the given sources and package.json dependencies. */
export async function projectWith(
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
): Promise<TargetProject> {
  const manifest = JSON.stringify({ name: 'app', dependencies });
  return loadTarget(await writeProject({ 'package.json': manifest, ...files }));
}

export async function removeTempProjects(): Promise<void> {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

/** Packages listed as `found` or `unknown` answer that way; everything else is missing from npm. */
export function fakeRegistry(
  found: readonly string[],
  unknown: readonly string[] = [],
): PackageRegistry {
  return {
    lookup(name): Promise<LookupResult> {
      if (found.includes(name)) return Promise.resolve('found');
      return Promise.resolve(unknown.includes(name) ? 'unknown' : 'missing');
    },
  };
}
