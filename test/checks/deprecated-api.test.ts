import { describe, expect, it } from 'vitest';
import { createDeprecatedApiCheck } from '../../src/checks/deprecated-api.js';
import { messages, runCheck } from '../helpers.js';

const check = createDeprecatedApiCheck();
const LIBRARY = `
/** @deprecated Use \`parseUrl()\` instead. */
export function parse(input: string): string { return input; }
export function parseUrl(input: string): string { return input; }
export class Codec {
  /** @deprecated since v2 - Use \`Codec.from()\` instead. */
  constructor(text: string);
  constructor(bytes: number[]);
  constructor(_value: string | number[]) {}
  static from(_text: string): Codec { return new Codec([]); }
  /** @deprecated */
  legacy(): void {}
}`;

describe('deprecated-api', () => {
  it('flags a deprecated function call and quotes its replacement', async () => {
    const findings = await runCheck(check, {
      'lib.ts': LIBRARY,
      'a.ts': `import { parse } from './lib.js';\nparse('x');`,
    });
    expect(findings).toMatchObject([{ file: 'a.ts', line: 2, severity: 'warning' }]);
    expect(messages(findings)).toEqual(['parse() is deprecated: Use parseUrl() instead.']);
  });

  it('flags only the deprecated constructor overload', async () => {
    const findings = await runCheck(check, {
      'lib.ts': LIBRARY,
      'a.ts': `import { Codec } from './lib.js';\nnew Codec('text');\nnew Codec([1]);`,
    });
    expect(messages(findings)).toEqual([
      'new Codec() is deprecated: since v2 - Use Codec.from() instead.',
    ]);
  });

  it('names deprecated methods without a note', async () => {
    const findings = await runCheck(check, {
      'lib.ts': LIBRARY,
      'a.ts': `import { Codec } from './lib.js';\nCodec.from('x').legacy();`,
    });
    expect(messages(findings)).toEqual(["Codec.from('x').legacy() is deprecated"]);
  });

  it('reports nothing for current APIs', async () => {
    const findings = await runCheck(check, {
      'lib.ts': LIBRARY,
      'a.ts': `import { Codec, parseUrl } from './lib.js';\nparseUrl('x');\nCodec.from('x');`,
    });
    expect(findings).toEqual([]);
  });
});
