import { execFile } from 'node:child_process';

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RunCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

/** Runs a program to completion. A non-zero exit is a result, not an error; failing to start is. */
export const runCommand: RunCommand = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new Error(`Could not run ${command}: ${error.message}`, { cause: error }));
        return;
      }
      resolve({ exitCode: error ? Number(error.code) : 0, stdout, stderr });
    });
  });
