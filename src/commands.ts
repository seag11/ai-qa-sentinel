import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createChecks } from './checks/index.js';
import { loadTarget } from './project.js';
import { createNpmRegistry, type PackageRegistry } from './registry.js';
import { formatJson, formatText } from './report.js';
import { scan } from './scan.js';

export const EXIT = { clean: 0, findings: 1, usage: 2 } as const;

export const USAGE = `Usage: sentinel scan <path> [options]

Report the bugs AI coding assistants are known to write in a TypeScript project.

Options:
  --offline     Skip npm registry lookups; phantom-import checks package.json only
  --json        Print findings as JSON
  -h, --help    Show this help`;

export interface CliIo {
  write(text: string): void;
  /** Injected so tests never touch the network. */
  readonly registry?: PackageRegistry;
}

/** Parses arguments, runs the command and returns the process exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        offline: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    io.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return EXIT.usage;
  }

  const { values, positionals } = parsed;
  const [command, target, ...extra] = positionals;
  if (values.help || command === undefined) {
    io.write(USAGE);
    return values.help ? EXIT.clean : EXIT.usage;
  }
  if (command !== 'scan' || target === undefined || extra.length > 0) {
    io.write(USAGE);
    return EXIT.usage;
  }
  if (!existsSync(target)) {
    io.write(`No such directory: ${target}`);
    return EXIT.usage;
  }

  const registry = values.offline ? undefined : (io.registry ?? createNpmRegistry());
  const checks = createChecks(registry ? { registry } : {});
  const result = await scan(await loadTarget(target), checks);

  io.write(values.json ? formatJson(result) : formatText(target, result, checks));
  return result.findings.length > 0 ? EXIT.findings : EXIT.clean;
}
