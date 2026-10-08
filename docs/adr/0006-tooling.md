# 0006. Build, lint and test tooling

- Status: accepted
- Date: 2026-10-08
- Implementation: implemented

## Context

The repository is a TypeScript library that ships ESM, CommonJS and declarations, must stay dependency-free and
runtime-neutral, and is meant to show that it is carefully built. Every quality claim should be a failing check, not
a promise.

## Decision

- **Package manager:** pnpm workspace, version pinned in `packageManager`; every dependency pinned exactly
  (`save-exact`).
- **Language:** TypeScript **6.0** with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature` and `verbatimModuleSyntax`.
- **Library isolation:** `tsconfig.lib.json` with `"types": []`, `lib: ["ES2022"]` and `isolatedDeclarations`
  (ADR 0002).
- **Build:** tsdown (exact version) producing ESM, CommonJS, `.d.ts` and `.d.cts`.
- **Package checks:** publint `--strict`, Are the Types Wrong `--pack`, a tarball contents check and
  `npm publish --dry-run`.
- **Lint:** ESLint `strictTypeChecked` and `stylisticTypeChecked` with the project service; eslint-plugin-regexp with
  super-linear backtracking and moves as errors; eslint-plugin-tsdoc; `no-warning-comments`; no classes in library
  code; eslint-config-prettier.
- **Format:** Prettier with its defaults.
- **Boundaries:** dependency-cruiser (ADR 0002). **Dead code:** knip.
- **Tests:** Vitest projects (library and tooling), V8 coverage with 95 % thresholds, fast-check through
  `@fast-check/vitest`, type tests (`*.test-d.ts`) with `expectTypeOf`.
- **Workflows:** actionlint and zizmor; every action pinned to a full commit SHA.
- **Releases:** Changesets for versions and changelog; tag-triggered publishing behind a version guard.

Details worth recording:

- **TypeScript stays on 6.0.x.** TypeScript 7 (the native port) is released, but typescript-eslint 8.71 supports
  `>=4.8.4 <6.1.0` and TypeDoc 0.28 supports up to 6.0. Renovate is limited to `<7` until both support 7.
- eslint-plugin-tsdoc pins `@typescript-eslint/utils` `~8.56`, whose peer range excludes TypeScript 6. A pnpm
  override aligns it with the typescript-eslint version the workspace uses, so installs have no peer warnings.
- tsc reports `isolatedDeclarations` errors only while emitting declarations, so `tsconfig.lib.json` emits them into
  `node_modules/.cache` instead of using `noEmit`; the published declarations come from tsdown.
- tsdown is 0.x, so it is pinned exactly; tsup is no longer maintained and recommends tsdown.
- Source maps are not published: the output is unminified and readable, and maps would point into `src/`, which is
  not in the package.
- Are the Types Wrong ignores the `node10` resolution: the package supports Node ≥ 22.12 and TypeScript's
  `node10` resolution is deprecated; supporting it would need `typesVersions` workarounds for every subpath export.
- Vitest's type-check mode is experimental and prints a warning, so `*.test-d.ts` files are checked by `tsc` as part
  of `pnpm typecheck` instead.
- Commit messages are checked by a small script (`scripts/check-commit-messages.mjs`) instead of commitlint, which
  would add dozens of packages for four rules.

## Alternatives considered

- **TypeScript 7.** Faster, but the linter and documentation generator cannot load it yet; revisit when they can.
- **tsup / unbuild / plain tsc.** tsup is unmaintained; unbuild and tsc need extra work for correct dual declarations.
- **Biome instead of ESLint + Prettier.** Fast, but has no type-aware rules comparable to `strictTypeChecked`, no
  regexp backtracking analysis and no TSDoc syntax check.
- **Jest.** Slower TypeScript setup, no project support comparable to Vitest's.

## Consequences

- `pnpm verify` runs every gate CI runs; `pnpm verify:fast` is quick enough for every commit.
- Each lint and boundary rule is proven by a fixture test, so configuration drift fails CI.
- Pinned versions need active updates; Renovate proposes them after a 3-day cooldown and automerges only
  devDependency patch and minor updates that pass CI.
