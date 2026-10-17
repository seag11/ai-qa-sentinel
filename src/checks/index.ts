import type { PackageRegistry } from '../registry.js';
import type { Check } from '../types.js';
import { createDeprecatedApiCheck } from './deprecated-api.js';
import { createPhantomImportCheck } from './phantom-import.js';
import { createPhantomMemberCheck } from './phantom-member.js';
import { createSloppyCodeCheck } from './sloppy-code.js';
import { createUnsafeRouteCheck } from './unsafe-route.js';

export interface CheckOptions {
  /** Omit to scan offline. */
  readonly registry?: PackageRegistry;
}

/** All checks, in the order their findings are reported. */
export function createChecks(options: CheckOptions = {}): Check[] {
  return [
    createPhantomImportCheck(options.registry ? { registry: options.registry } : {}),
    createPhantomMemberCheck(),
    createDeprecatedApiCheck(),
    createUnsafeRouteCheck(),
    createSloppyCodeCheck(),
  ];
}
