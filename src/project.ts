import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
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

/** Loads a project from disk. Without a tsconfig.json, every TypeScript file outside node_modules is scanned. */
export async function loadTarget(root: string): Promise<TargetProject> {
  const absoluteRoot = path.resolve(root);
  const config = readTsConfig(absoluteRoot);
  const manifest = await readManifest(path.join(absoluteRoot, 'package.json'));

  return {
    root: absoluteRoot,
    files: config.fileNames.filter((file) => !file.endsWith('.d.ts')),
    packageName: manifest.name,
    dependencies: manifest.dependencies,
    pathAliases: Object.keys(config.options.paths ?? {}),
  };
}

/** Parses package.json text into the fields the sources care about. */
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

function readTsConfig(root: string): ts.ParsedCommandLine {
  const configPath = path.join(root, 'tsconfig.json');
  const raw: unknown = existsSync(configPath)
    ? ts.readConfigFile(configPath, (file) => ts.sys.readFile(file)).config
    : {};
  return ts.parseJsonConfigFileContent(raw, ts.sys, root);
}

async function readManifest(manifestPath: string): Promise<PackageManifest> {
  if (!existsSync(manifestPath)) return { name: undefined, dependencies: new Map() };
  return parseManifest(await readFile(manifestPath, 'utf8'));
}
