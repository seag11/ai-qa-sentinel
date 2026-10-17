import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Project } from 'ts-morph';
import { isRecord } from './guards.js';
import type { TargetProject } from './types.js';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

interface PackageManifest {
  readonly name: string | undefined;
  readonly dependencies: ReadonlyMap<string, string>;
}

/** Loads a project from disk, using its tsconfig.json when it has one. */
export async function loadTarget(root: string): Promise<TargetProject> {
  const absoluteRoot = path.resolve(root);
  const tsConfigFilePath = path.join(absoluteRoot, 'tsconfig.json');
  const ts = existsSync(tsConfigFilePath)
    ? new Project({ tsConfigFilePath })
    : projectFromGlob(absoluteRoot);
  const manifest = await readManifest(path.join(absoluteRoot, 'package.json'));
  return createTarget(absoluteRoot, ts, manifest);
}

export function createTarget(root: string, ts: Project, manifest: PackageManifest): TargetProject {
  const sourceFiles = ts
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile() && !file.isInNodeModules() && isInside(root, file.getFilePath()),
    );
  return {
    root,
    ts,
    sourceFiles,
    packageName: manifest.name,
    dependencies: manifest.dependencies,
  };
}

/** Parses package.json text into the fields the checks care about. */
export function parseManifest(text: string): PackageManifest {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) return { name: undefined, dependencies: new Map() };

  const dependencies = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    const entries = parsed[field];
    if (!isRecord(entries)) continue;
    for (const [name, spec] of Object.entries(entries)) {
      if (typeof spec === 'string') dependencies.set(name, spec);
    }
  }
  const name = typeof parsed.name === 'string' ? parsed.name : undefined;
  return { name, dependencies };
}

async function readManifest(manifestPath: string): Promise<PackageManifest> {
  if (!existsSync(manifestPath)) return { name: undefined, dependencies: new Map() };
  return parseManifest(await readFile(manifestPath, 'utf8'));
}

function projectFromGlob(root: string): Project {
  const ts = new Project({ compilerOptions: { strict: true, allowJs: false } });
  ts.addSourceFilesAtPaths([
    path.join(root, '**/*.{ts,tsx,mts,cts}'),
    `!${path.join(root, '**/node_modules/**')}`,
    `!${path.join(root, '**/dist/**')}`,
  ]);
  return ts;
}

function isInside(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
