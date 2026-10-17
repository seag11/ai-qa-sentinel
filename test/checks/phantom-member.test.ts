import { describe, expect, it } from 'vitest';
import { createPhantomMemberCheck } from '../../src/checks/phantom-member.js';
import { messages, runCheck } from '../helpers.js';

const check = createPhantomMemberCheck();
const USER = `interface User { firstName: string; lastName: string }\ndeclare const user: User;\n`;

describe('phantom-member', () => {
  it('flags `as any` hiding a call to a method the type does not have', async () => {
    const findings = await runCheck(check, { 'a.ts': `${USER}(user as any).fullName();` });
    expect(findings).toMatchObject([{ severity: 'error', line: 3 }]);
    expect(messages(findings)).toEqual([
      `'as any' hides call to user.fullName(), which does not exist on User`,
    ]);
  });

  it('flags `as any` hiding a property read too', async () => {
    const findings = await runCheck(check, { 'a.ts': `${USER}const n = (user as any).age;` });
    expect(messages(findings)).toEqual([`'as any' hides user.age, which does not exist on User`]);
  });

  it('only warns when `as any` hides a member that does exist', async () => {
    const findings = await runCheck(check, { 'a.ts': `${USER}const n = (user as any).firstName;` });
    expect(findings).toMatchObject([{ severity: 'warning' }]);
    expect(messages(findings)[0]).toContain(`'as any' turns off type checking for user`);
  });

  it('does not treat index-signature types as missing members', async () => {
    const findings = await runCheck(check, {
      'a.ts': `declare const bag: Record<string, number>;\nconst n = (bag as any).anything;`,
    });
    expect(findings.map((f) => f.severity)).toEqual(['warning']);
  });

  it('warns about explicit any annotations, naming what they cover', async () => {
    const findings = await runCheck(check, {
      'a.ts': `export function f(input: any) { return input; }`,
    });
    expect(messages(findings)).toEqual([`explicit 'any' type on 'input'`]);
  });

  it('warns about @ts-ignore and @ts-nocheck, but not @ts-expect-error', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        '// @ts-nocheck',
        '// @ts-ignore',
        'const a: number = "x";',
        '// @ts-expect-error: fixture',
        'const b: number = "y";',
        `const text = '// @ts-ignore inside a string is not a comment';`,
      ].join('\n'),
    });
    expect(findings.map((f) => f.line)).toEqual([1, 2]);
  });

  it('warns about untyped JSON.parse results, but accepts annotated ones', async () => {
    const findings = await runCheck(check, {
      'a.ts': [
        `const loose = JSON.parse('{}');`,
        `const name = JSON.parse('{}').name;`,
        `const safe: unknown = JSON.parse('{}');`,
      ].join('\n'),
    });
    expect(findings.map((f) => f.line)).toEqual([1, 2]);
  });

  it('reports nothing for fully typed code', async () => {
    const findings = await runCheck(check, {
      'a.ts': `${USER}export const full = \`\${user.firstName} \${user.lastName}\`;`,
    });
    expect(findings).toEqual([]);
  });
});
