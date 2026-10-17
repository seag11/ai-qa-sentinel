#!/usr/bin/env node
import { runCli } from './commands.js';

process.exitCode = await runCli(process.argv.slice(2), {
  write: (text) => process.stdout.write(`${text}\n`),
});
