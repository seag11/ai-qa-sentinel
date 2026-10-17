import { describe, expect, it } from 'vitest';
import { createChecks } from '../src/checks/index.js';
import { loadTarget } from '../src/project.js';
import { scan } from '../src/scan.js';
import { fakeRegistry } from './helpers.js';

const healthy = { ageDays: 3000, weeklyDownloads: 1_000_000 };

/** The phase 1 exit gate: every seeded rule bug in the demo app is found, and nothing else. */
describe('scanning examples/slop-shop', () => {
  it('finds exactly the seeded bugs', async () => {
    const registry = fakeRegistry({
      fastify: healthy,
      '@types/node': healthy,
      typescript: healthy,
      vitest: healthy,
      tsx: healthy,
    });
    const target = await loadTarget('examples/slop-shop');
    const { findings } = await scan(target, createChecks({ registry }));

    expect(
      findings.map(({ checkId, file, line, message }) => ({ checkId, file, line, message })),
    ).toEqual([
      {
        checkId: 'phantom-import',
        file: 'src/pay.ts',
        line: 24,
        message: `'stripe-helpers-pro' is not on npm`,
      },
      {
        checkId: 'phantom-member',
        file: 'src/user.ts',
        line: 10,
        message: `'as any' hides call to user.fullName(), which does not exist on User`,
      },
      {
        checkId: 'deprecated-api',
        file: 'src/files.ts',
        line: 3,
        message:
          'new Buffer() is deprecated: since v10.0.0 - Use Buffer.from(string[, encoding]) instead.',
      },
      {
        checkId: 'unsafe-route',
        file: 'src/orders.ts',
        line: 22,
        message: 'POST /orders: no body schema; input reaches SQL',
      },
      {
        checkId: 'sloppy-code',
        file: 'src/stock.ts',
        line: 28,
        message: 'promise from reserve() is never awaited; errors and ordering are lost',
      },
    ]);
  });
});
