import type { RunCommand } from '../process.js';
import type { PackageRegistry } from '../registry.js';
import type { FindingSource } from '../types.js';
import { createEslintSource } from './eslint.js';
import { createPhantomImportSource } from './phantom-import.js';

export interface SourceOptions {
  /** Omit to scan offline. */
  readonly registry?: PackageRegistry;
  readonly runCommand?: RunCommand;
}

/** All finding sources, in the order their findings are reported. */
export function createSources(options: SourceOptions = {}): FindingSource[] {
  return [createPhantomImportSource(options.registry), createEslintSource(options.runCommand)];
}
