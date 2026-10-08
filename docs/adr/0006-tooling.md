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
- **Node versions:** the library supports Node >= 22.12 (`engines`); contributors need Node >= 22.18 (or 24.11+),
  the range tsdown 0.23.0 declares in its `engines` field
  ([npm](https://www.npmjs.com/package/tsdown/v/0.23.0)). CI runs the full gates on Node 22 and 24, and the
  `Consumer (Node 22.12)` job builds and packs the library, installs the tarball into a temporary project on
  Node 22.12 and imports it through both ESM and CommonJS, so the library floor is tested, not assumed.
- **Package checks:** publint `--strict`, Are the Types Wrong `--pack`, a tarball contents check and
  `npm publish --dry-run`. `files` lists `dist` and `NOTICE`: the HL7 attribution and the CC0 and trademark
  statements of ADR 0005 must travel with every copy of the package, and npm always adds `LICENSE`, `README.md` and
  `package.json` itself. The `prepack` script copies these files from the repository root, so the repository holds
  one copy.
- **Lint:** ESLint `strictTypeChecked` and `stylisticTypeChecked` with the project service; eslint-plugin-regexp with
  super-linear backtracking and moves as errors; eslint-plugin-tsdoc; `no-warning-comments`; no classes in library
  code; eslint-config-prettier.
- **Format:** Prettier with its defaults.
- **Boundaries:** dependency-cruiser and a second line of defense in ESLint (ADR 0002). They overlap on purpose:
  ESLint reports Node globals and imports in the editor at the offending line, while dependency-cruiser sees the
  whole module graph, which ESLint cannot: layer rules, cycles and transitive imports. **Dead code:** knip.
- **Tests:** Vitest projects (library and tooling), V8 coverage with 95 % thresholds, fast-check through
  `@fast-check/vitest`, type tests (`*.test-d.ts`) with `expectTypeOf`.
- **Workflows:** actionlint and zizmor; every action pinned to a full commit SHA. `pnpm verify:ci` runs every gate
  except the workflow lint; `pnpm verify` adds `lint:workflows`, which needs Go (actionlint) and pipx (zizmor). CI
  runs `verify:ci` in the matrix job and `lint:workflows` as a separate job, so the matrix needs neither tool.
- **Releases:** Changesets for versions and changelog; tag-triggered publishing behind a version guard.

Details worth recording:

- **TypeScript stays on 6.0.x.** TypeScript 7 (the native port) is the `latest` npm release
  ([7.0.2](https://www.npmjs.com/package/typescript)), but typescript-eslint 8.71.1 declares the peer range
  `>=4.8.4 <6.1.0` ([npm](https://www.npmjs.com/package/typescript-eslint/v/8.71.1)) and TypeDoc 0.28.20 lists
  TypeScript up to `6.0.x` ([npm](https://www.npmjs.com/package/typedoc/v/0.28.20)); both checked 2026-10-08.
  Renovate is limited to `<7` until both support 7.
- **`@types/node` stays below 23.** The Renovate rule keeps the Node typings on the oldest supported Node major
  (22), so the library cannot type-check against an API that Node 22.12 lacks.
- eslint-plugin-tsdoc pins `@typescript-eslint/utils` `~8.56`, whose peer range excludes TypeScript 6. A pnpm
  override aligns it with the typescript-eslint version the workspace uses, so installs have no peer warnings.
- tsc reports `isolatedDeclarations` errors only while emitting declarations, so `tsconfig.lib.json` emits them into
  `node_modules/.cache` instead of using `noEmit`; the published declarations come from tsdown.
- tsdown is 0.x, so it is pinned exactly.
- Source maps are not published (`sourcemap: false`): the output is unminified and readable, and maps would point
  into `src/`, which is not in the package, so they would reference files users cannot open.
- Are the Types Wrong ignores the `node10` resolution: the package supports Node ≥ 22.12 and TypeScript's
  `node10` resolution is deprecated; supporting it would need `typesVersions` workarounds for every subpath export.
- Vitest's type-check mode is experimental and prints a warning, so `*.test-d.ts` files are checked by `tsc` as part
  of `pnpm typecheck` instead.
- Commit messages are checked by a small script (`scripts/check-commit-messages.mjs`) instead of commitlint for
  dependency weight: `@commitlint/cli` with `@commitlint/config-conventional` resolves to about 95 packages in an
  npm lockfile (measured 2026-10-08), for the four rules the project enforces (type, lowercase start, no trailing
  period, 72 characters). The script has its own tests.

## Alternatives considered

- **TypeScript 7.** Faster, but the linter and documentation generator cannot load it yet; revisit when they can.
- **tsup / unbuild / plain tsc.** The tsup README states that the project "is not actively maintained anymore" and
  recommends tsdown ([README](https://github.com/egoist/tsup#readme)); unbuild and tsc need extra work for correct
  dual declarations.
- **Biome instead of ESLint + Prettier.** Biome 2 has some type-aware rules (for example `noFloatingPromises`), but
  the project wants the maintained `strictTypeChecked` and `stylisticTypeChecked` presets of typescript-eslint as a
  whole, plus eslint-plugin-regexp (backtracking analysis) and eslint-plugin-tsdoc (TSDoc syntax). We did not
  evaluate Biome equivalents of the last two and did not compare Biome's type-aware rules rule by rule.
- **Jest.** Jest has a `projects` option, so multi-project runs are not the difference. Its docs call ESM support
  [experimental](https://github.com/jestjs/jest/blob/main/docs/ECMAScriptModules.md) and TypeScript needs Babel,
  ts-jest or Node's type stripping ([Getting started](https://github.com/jestjs/jest/blob/main/docs/GettingStarted.md)),
  whereas Vitest lists ESM and TypeScript as
  [supported out of the box](https://github.com/vitest-dev/vitest/blob/main/docs/guide/features.md) and bundles
  `expect-type` for type tests. For an ESM-first TypeScript package that is less configuration to maintain.

## Consequences

- `pnpm verify` runs every gate CI runs; `pnpm verify:ci` is the same without the workflow lint, which needs Go and
  pipx; `pnpm verify:fast` is quick enough for every commit.
- Each lint and boundary rule is proven by a fixture test, so configuration drift fails CI.
- Pinned versions need active updates; Renovate proposes them after a 3-day cooldown and automerges only
  devDependency patch and minor updates that pass CI.
