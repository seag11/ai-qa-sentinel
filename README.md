# Sentinel

> A test gate for AI code fixes. The AI suggests, the tests decide.

Sentinel asks an LLM to fix code findings, then keeps a fix only if it clears a four-stage gate:
types, a re-scan, the existing tests, and LLM-written edge-case tests. Its headline result is a
measured **false-fix rate**: how often a fix that passes every check is still wrong.

> **Status:** phase 1 of 3. `sentinel scan` works: it collects findings from ESLint plus one built-in
> check. Coming next are the LLM `fix` command and the gate. See [Roadmap](#roadmap).

## Why

AI-generated code fails in measured, repeatable ways. For example, at least 5.2% of
commercial-model samples import a package that doesn't exist
([Spracklen et al., USENIX Security 2025](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen)),
and code that passes basic tests often breaks on edge cases
([EvalPlus](https://arxiv.org/abs/2305.01210)). A fix written by the same models can repeat
those failures, so Sentinel gates every fix instead of trusting it.

## Prior art

Sentinel builds on existing tools rather than re-implementing them:

| Job               | Existing tools                                                                                                                                                    | Sentinel's part                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Find bugs         | [typescript-eslint](https://typescript-eslint.io/rules/no-floating-promises/), [CodeQL](https://codeql.github.com/codeql-query-help/javascript/js-sql-injection/) | Reads ESLint's results, and adds one check ESLint can't do: packages missing from npm |
| Suggest AI fixes  | [GitHub Copilot Autofix](https://docs.github.com/en/code-security/code-scanning/managing-code-scanning-alerts/responsible-use-autofix-code-scanning)              | Every fix must clear an automated gate before a person sees it                        |
| Filter LLM output | [Meta's TestGen-LLM](https://arxiv.org/abs/2402.09171) keeps generated tests only if they build, pass and add coverage                                            | Applies the same filtering idea to fixes, and measures what slips through             |

## Quickstart

Requires Node 22.13+ and pnpm. Run `corepack enable` once to get the pinned pnpm.

```sh
pnpm install
pnpm sentinel scan examples/slop-shop             # checks package names against npm
pnpm sentinel scan examples/slop-shop --offline   # package.json only, no network
pnpm sentinel scan examples/slop-shop --json
```

```text
sentinel scan examples/slop-shop

  phantom-import                              src/pay.ts:24    'stripe-helpers-pro' is not on npm
  @typescript-eslint/no-deprecated            src/files.ts:3   `Buffer` is deprecated. since v10.0.0 - Use `Buffer.from(string[, encoding])` instead.
  @typescript-eslint/no-floating-promises     src/stock.ts:34  Promises must be awaited, ...
  @typescript-eslint/no-unsafe-call           src/user.ts:10   Unsafe call of an `any` typed value.
  @typescript-eslint/no-explicit-any          src/user.ts:10   Unexpected any. Specify a different type.
  @typescript-eslint/no-unsafe-member-access  src/user.ts:10   Unsafe member access .fullName on an `any` value.

6 findings · 1.2s
```

Exit codes: `0` clean, `1` findings, `2` usage error.

## The demo app: slop-shop

[`examples/slop-shop`](examples/slop-shop) is a small Fastify orders API written the way an AI
assistant writes code. **It compiles and its tests pass** (`pnpm --filter slop-shop test`). It
also has four seeded bugs: a package that doesn't exist, a call through `as any` to a method that
doesn't exist, a deprecated `new Buffer()`, and a promise that is never awaited.

The missing package is the interesting one. The AI imported `stripe-helpers-pro`, which isn't on
npm, then made the compiler error go away by adding a `declare module` shim. `tsc` is happy. If
anyone registers that name, their code runs in your app, an attack known as
[slopsquatting](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen).

## How it works

```text
scan ──▶ fix (LLM) ──▶ gate, on a temp copy ──────────────────────────────▶ kept or rejected
                       types · re-scan · existing tests · edge-case tests
```

Findings come from any `FindingSource`:

```ts
export interface FindingSource {
  readonly id: string;
  find(project: TargetProject): Promise<Finding[]>;
}
```

Two exist today: `phantom-import`, which parses imports with the TypeScript compiler API and checks
each package against package.json and the npm registry, and `eslint`, which runs the project's own
ESLint with the JSON formatter. Anything that touches the outside world, such as the registry or a
child process, is passed in as an argument, so tests use fakes.

## Development

```sh
pnpm test            # unit and integration tests
pnpm test:coverage   # CI enforces 90% line coverage for src/sources
pnpm lint            # ESLint (strict type-checked) + Prettier
pnpm typecheck
pnpm selfscan        # Sentinel scans itself: must report 0 findings
```

## Roadmap

1. **Scan** (done): ESLint input, `phantom-import`, slop-shop, CI.
2. **Fix and gate:** an LLM client with an offline replay mode, a patch builder, and three gate
   stages (types, re-scan, existing tests). Exit: the demo shows one kept and one rejected fix
   with no network.
3. **Prove:** the edge-case stage (fast-check properties written without seeing the patch), a
   corpus of about 30 samples with hidden tests, and `pnpm bench`, which reports the false-fix rate
   with and without that stage.

## Limitations

- TypeScript only, and ESLint findings are only as good as the project's ESLint config.
- With `--offline`, `phantom-import` checks package.json only. It can't tell whether a declared
  package really exists on npm.
