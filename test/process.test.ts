import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/process.js';

describe('runCommand', () => {
  it('returns output and a non-zero exit code instead of throwing', async () => {
    const result = await runCommand(
      process.execPath,
      ['-e', 'console.log(process.cwd()); console.error("bad"); process.exit(3)'],
      '/',
    );
    expect(result).toEqual({ exitCode: 3, stdout: '/\n', stderr: 'bad\n' });
  });

  it('rejects when the program cannot start', async () => {
    await expect(runCommand('/no/such/program', [], '/')).rejects.toThrow(
      'Could not run /no/such/program',
    );
  });
});
