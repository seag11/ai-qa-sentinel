# Sentinel

> Catch the bugs AI writes. The AI suggests, the tests decide.

Sentinel scans TypeScript, Node and Fastify code for the mistakes AI coding assistants are
_measurably_ known to make. These are packages that don't exist, methods that don't exist,
deprecated APIs, insecure routes and unfinished code. Each check is tied to a published study.

> **Status:** phase 1 of 3. The five rule checks and the demo app work. Coming next: the
> LLM-powered `fix` command, where a patch is kept only if `tsc` and the tests pass, and the
> `edge-case-probe` check. See [Roadmap](#roadmap).

## Why

AI-generated code tends to fail in the same few ways, and researchers have measured how often:

| Check            | Catches                                                                   | Evidence                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phantom-import` | Packages that don't exist on npm, or aren't in package.json               | [Spracklen et al., USENIX Security 2025](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen): at least 5.2% of commercial-model samples import a package that doesn't exist                      |
| `phantom-member` | `as any`, `@ts-ignore` and untyped JSON hiding invented methods           | [Tambon et al., 2024](https://arxiv.org/abs/2403.08937): "hallucinated object" and "wrong attribute" are among the top bug types                                                                                        |
| `deprecated-api` | APIs whose typings say `@deprecated`, such as `new Buffer()`              | [Wang et al., ICSE 2025](https://arxiv.org/abs/2406.09834): LLMs often suggest deprecated APIs                                                                                                                          |
| `unsafe-route`   | Fastify routes without a body schema, or input reaching SQL, HTML or logs | [Veracode 2025](https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/): the insecure option was chosen in 45% of cases |
| `sloppy-code`    | Floating promises, empty catches, identical branches, stubs, TODOs        | [Tambon et al., 2024](https://arxiv.org/abs/2403.08937): "silly mistake" and "incomplete code" categories                                                                                                               |

Most of these studies tested Python or several languages, not TypeScript specifically, and newer
models may do better. The patterns still apply, though the rates will vary.

## Quickstart

Requires Node 22.13+ and pnpm. Run `corepack enable` once to get the pinned pnpm.

```sh
pnpm install
pnpm sentinel scan examples/slop-shop      # live npm lookups
pnpm sentinel scan examples/slop-shop --offline --json
```

```text
sentinel scan examples/slop-shop

  phantom-import  src/pay.ts:24     'stripe-helpers-pro' is not on npm
  phantom-member  src/user.ts:10    'as any' hides call to user.fullName(), which does not exist on User
  deprecated-api  src/files.ts:3    new Buffer() is deprecated: since v10.0.0 - Use Buffer.from(string[, encoding]) instead.
  unsafe-route    src/orders.ts:22  POST /orders: no body schema; input reaches SQL
  sloppy-code     src/stock.ts:28   promise from reserve() is never awaited; errors and ordering are lost

5 findings · 0.9s
```

Exit codes: `0` clean, `1` findings, `2` usage error, so the command can gate CI.

## The demo app: slop-shop

[`examples/slop-shop`](examples/slop-shop) is a small Fastify orders API written the way an AI
assistant writes code. **It compiles and its tests pass** (`pnpm --filter slop-shop test`). It
also hides a seeded bug for each check, including a sixth one (`applyDiscount(100, 1.5)` returns
`-50`) that no rule can catch. That one is for the upcoming LLM-driven `edge-case-probe`.

The payment helper is a good example. The AI imported `stripe-helpers-pro`, which doesn't exist,
then "fixed" the compiler error by adding a `declare module` shim. `tsc` is happy, and anyone who
registers that name on npm gets their code run in your app. This attack is called
[slopsquatting](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen).

## How it works

```text
scan ──▶ fix (LLM, phase 2) ──▶ verify: tsc + vitest on a copy ──▶ keep or drop the patch
```

Each check is a single file that implements one interface:

```ts
export interface Check {
  readonly id: string;
  readonly description: string;
  readonly evidence: readonly Evidence[];
  run(project: TargetProject): Promise<Finding[]>;
}
```

Checks work on the real TypeScript program through [ts-morph](https://ts-morph.com), so they can
ask the type checker questions like "does `User` actually have `fullName`?". They don't just match
text. Anything that touches the outside world, such as the npm registry, is passed in as an
argument, so tests use fakes and never hit the network.

## Development

```sh
pnpm test            # unit tests: each check has bug cases plus clean look-alikes
pnpm test:coverage   # CI enforces 90% line coverage for src/checks
pnpm lint            # ESLint (strict type-checked) + Prettier
pnpm typecheck
pnpm selfscan        # Sentinel scans itself: must report 0 findings
```

## Roadmap

1. **Scan** (done): repo, CI, strict TypeScript, five rule checks, slop-shop.
2. **Fix and verify:** LLM client with an offline replay mode, a patch builder, a verifier that
   runs `tsc` and `vitest` on a temp copy, and `edge-case-probe` (LLM-written fast-check properties).
3. **Prove:** a labeled corpus of LLM-written code, and a `pnpm bench` that reports precision,
   recall, fix acceptance and false-fix rate against a plain ESLint baseline.

## Limitations

- TypeScript only. Route analysis understands Fastify, and the data-flow tracking stays within one
  handler. It does not follow values across function calls.
- `unsafe-route` trusts schemas it can't see (for example, one imported from another file). It
  treats any function call as a possible sanitizer, so it favors precision over recall.
- `phantom-import` can only flag new or rarely downloaded packages when it can reach the npm
  registry. With `--offline`, it checks package.json only.
