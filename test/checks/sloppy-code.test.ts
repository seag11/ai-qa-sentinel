import { describe, expect, it } from 'vitest';
import { createSloppyCodeCheck } from '../../src/checks/sloppy-code.js';
import { messages, runCheck } from '../helpers.js';

const check = createSloppyCodeCheck();
const ASYNC = `declare function save(): Promise<void>;\ndeclare function load(): Promise<string>;\n`;

describe('sloppy-code', () => {
  it('flags a promise that is never awaited', async () => {
    const findings = await runCheck(check, { 'a.ts': `${ASYNC}export function f() { save(); }` });
    expect(findings).toMatchObject([{ severity: 'error', line: 3 }]);
    expect(messages(findings)).toEqual([
      'promise from save() is never awaited; errors and ordering are lost',
    ]);
  });

  it('flags a floating .then() chain but accepts handled ones', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        ASYNC,
        'load().then((s) => s.length);',
        'load().catch(() => "fallback");',
        'load().then((s) => s, () => "fallback");',
        'void save();',
        'export async function g() { await save(); return load(); }',
      ].join('\n'),
    });
    expect(messages(findings)).toEqual([
      'promise from then() is never awaited; errors and ordering are lost',
    ]);
  });

  it('flags identical if/else branches and ternaries', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        'export function f(admin: boolean) {',
        '  if (admin) { return 1; } else {',
        '    return 1;',
        '  }',
        '}',
        'export const g = (x: boolean) => (x ? "a" : "a");',
        'export function h(x: number) { if (x > 1) { return 1; } else if (x > 0) { return 1; } return 0; }',
      ].join('\n'),
    });
    expect(messages(findings)).toEqual([
      'if and else branches are identical',
      'both sides of the ternary are identical',
    ]);
  });

  it('flags an empty catch, but not one that explains itself', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        'try { JSON.stringify({}); } catch {}',
        'try { JSON.stringify({}); } catch { /* optional cache, a miss is fine */ }',
        'try { JSON.stringify({}); } catch (e) { console.error(e); }',
      ].join('\n'),
    });
    expect(findings).toMatchObject([{ line: 1, message: 'empty catch block swallows the error' }]);
  });

  it('flags unfinished stubs and TODO comments', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        'export function refund(): never {',
        '  // TODO: call the payments API',
        "  throw new Error('Not implemented');",
        '}',
        "export function fail(): never { throw new Error('Card declined'); }",
        "export const label = 'TODO list';",
      ].join('\n'),
    });
    expect(messages(findings)).toEqual([
      'unfinished: TODO comment left in code',
      "unfinished stub: throws 'Not implemented'",
    ]);
  });

  it('reports nothing for tidy code', async () => {
    const findings = await runCheck(check, {
      'a.ts': `${ASYNC}export async function f(flag: boolean) {\n  await save();\n  return flag ? load() : 'none';\n}`,
    });
    expect(findings).toEqual([]);
  });
});
