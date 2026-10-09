# Contributing to hl7-to-fhir

Thank you for helping. This guide covers the setup, the quality gates every change passes, and the conventions for
commits, changesets and test data. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Synthetic data only

Issues, pull requests, tests, samples and documentation must only contain **synthetic** HL7 messages and FHIR
resources. Use the fictional names from the HL7 standard (for example `Everyman^Adam` and `Everywoman^Eve`),
fictional `urn:oid:` identifier systems (the official validator rejects `example.org` URLs) and obviously fake
identifiers. Never paste real patient data, not even "just for a minute".
If it happens anyway, follow [Patient data posted by mistake](SECURITY.md#patient-data-posted-by-mistake).

## Setup

Contributors need Node.js 22.18+ on the 22 line, 24.11+ on the 24 line, or 26+ (the version in [`.nvmrc`](.nvmrc) is
recommended), and pnpm, which Corepack provides in the version pinned in `package.json`. The floor is higher than the
one for library users (Node.js 22.12) because the build tool, tsdown, declares `^22.18.0 || ^24.11.0 || >=26.0.0` in
its `engines` field, which the root `package.json` repeats; the published library itself runs on Node.js 22.12 and
newer, which the `Consumer (Node 22.12)` CI job checks.

```sh
corepack enable
pnpm install
pnpm verify:fast
```

`pnpm verify` also checks the GitHub workflows (`pnpm lint:workflows`) and therefore needs Go (actionlint) and pipx
(zizmor). `pnpm verify:ci` runs every other gate without them. zizmor runs its online audits only when `GH_TOKEN` is
set.

## Repository layout

| Path                   | Contents                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/hl7-to-fhir` | The published library: `src/` sources, `test/` unit, type and FHIR tests                           |
| `tooling/`             | Tests proving that the lint and boundary rules fire, with their fixtures, and the issue-form tests |
| `scripts/`             | Small, tested Node scripts used by CI and the release                                              |
| `docs/adr/`            | Architecture decision records                                                                      |
| `.github/workflows/`   | CI, release and FHIR validator workflows                                                           |

The architecture boundaries are enforced, not just documented: `src/hl7v2` knows nothing about FHIR, `src/fhir`
builds on `src/hl7v2`, and only `src/cli` may use Node APIs. See [ADR 0002](docs/adr/0002-single-package-with-tooling-boundaries.md).

## Scripts

| Script                        | What it does                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm format`                 | Formats everything with Prettier                                                            |
| `pnpm lint`                   | ESLint with zero warnings allowed                                                           |
| `pnpm typecheck`              | `tsc` for every config, including the Node-free library config                              |
| `pnpm test`                   | Vitest: library and tooling tests, without the slow scaling tests                           |
| `pnpm test:scaling`           | Vitest: the scaling tests, which fail quadratic running time (about a minute)               |
| `pnpm test:coverage`          | All tests, scaling included, with coverage; fails below 95 % on the library and the scripts |
| `pnpm depcruise`              | Checks the layer boundaries with dependency-cruiser                                         |
| `pnpm knip`                   | Finds unused files, exports and dependencies                                                |
| `pnpm build`                  | Builds the library (ESM, CommonJS and declarations) with tsdown                             |
| `pnpm check:type-performance` | Compiles a fixture of path calls and fails above the budgeted number of type instantiations |
| `pnpm check:api`              | Compares the built declarations with the API report and checks examples                     |
| `pnpm update:api`             | Builds and rewrites the API report in `packages/hl7-to-fhir/api/`                           |
| `pnpm check:package`          | publint, Are the Types Wrong, tarball contents and `npm publish --dry-run`                  |
| `pnpm bench`                  | Builds, then measures the throughput of `parse` and `splitBatch` (not part of `verify`)     |
| `pnpm bench:memory`           | Builds, then measures the heap a parsed message retains (not part of `verify`)              |
| `pnpm lint:workflows`         | actionlint and zizmor on the GitHub workflows (needs Go and pipx)                           |
| `pnpm verify:fast`            | Format check, lint, typecheck and tests; needs no build; skips the scaling tests            |
| `pnpm verify:ci`              | Every gate except `lint:workflows`: needs neither Go nor pipx                               |
| `pnpm verify`                 | `verify:ci` plus `lint:workflows`: everything CI runs                                       |

`pnpm check:api` and `pnpm check:package` inspect the build output, so run `pnpm build` first; `pnpm verify:ci` and
`pnpm verify` do.

## Public API

The bundled declarations of both entry points are committed in `packages/hl7-to-fhir/api/` as an API report
([ADR 0007](docs/adr/0007-api-report-without-api-extractor.md)). When a change alters the public API on purpose, run
`pnpm update:api` and commit the updated report with the change, so reviewers see the API difference. Every exported
function needs an `@example` in its TSDoc; `pnpm check:api` fails otherwise. It also compiles every example and runs
the ones that state an output: a comment `// => <expression>` after an expression statement must equal what the
statement evaluates to, and after a `console` call it must equal the comma-separated arguments, as in
`console.log(get(message, "PID.5.1")); // => "Everyman"`. A comment without the arrow is not checked, so it states no output.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`
with one of the types `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style` or
`revert`. The description is imperative, starts lowercase, has no trailing period, and the subject line is at most 72
characters. A body is welcome when the _why_ is not obvious. Details of what the check accepts:

- `revert:` is a normal type. Git's default message, `Revert "<subject>"`, is accepted when the inner subject is
  valid; the 72-character limit applies to the inner subject. A revert of a revert (a nested `Revert "Revert …"`) is
  rejected: write a `revert:` or `fix:` subject that says why instead.
- The optional `!` before the colon marks a breaking change, as in `feat(api)!: rename the convert options`.
- `fixup!` and `squash!` commits are rejected. Squash them before the review.

Keep commits small and atomic. **Every commit must pass `pnpm verify:fast` on its own**: CI replays each commit of a
pull request and runs the fast gates on it, and pull requests are merged with rebase, so every commit lands on `main`
unchanged. Commit tests together with the code they test. The fast gates must not need a build: CI runs them on a
fresh checkout without `dist/`.

## Changesets

Every pull request that changes the published package adds a changeset:

```sh
pnpm changeset          # describe a user-facing change and choose patch, minor or major
pnpm changeset --empty  # for changes that need no release note, such as tooling or tests
```

CI requires a changeset whenever `packages/hl7-to-fhir/src` changes.

## Pull requests

Open the pull request from a branch whose prefix is a commit type: `feat/…`, `fix/…`, `docs/…`, `test/…`,
`refactor/…`, `perf/…`, `build/…`, `ci/…` or `chore/…`. Fill in the template. A pull request is merged when these
checks are green and the review gate is completed:

- `Verify (Node 22)` and `Verify (Node 24)`: the full gates on both Node versions, including the scaling tests, which
  `pnpm test:coverage` runs; a quadratic running time fails these required checks, not `Every commit passes`
- `Consumer (Node 22.12)`: the packed library installs and imports on its minimum Node version
- `Every commit passes`: commit messages and `pnpm verify:fast` on each commit
- `Changeset`: a changeset exists when the library changed
- `Workflows`: actionlint and zizmor

The FHIR validator workflow only runs when mappings or its own files change, so it is not a required check; when it runs
and fails, the pull request is not ready. Bumping `VALIDATOR_VERSION` in `.github/workflows/validator.yml` also needs a new
`VALIDATOR_SHA256`: leave it empty once, let the job print the checksum of the downloaded jar, compare it with an
independent download and commit it. Renovate can propose the version but cannot compute the checksum.

## Releases

Releases are cut by the maintainer: a `chore(release): vX.Y.Z` pull request runs `pnpm changeset version`, and after it
is merged the maintainer pushes the tag `vX.Y.Z`. The release workflow checks that the tagged commit is an
ancestor of `main`, runs the version guard (the tag must be `v` plus the package version, a plain `MAJOR.MINOR.PATCH`),
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:package`, and then publishes to npm with
provenance. A final job installs the published version from npm and loads it as ESM and CommonJS.

The first release, 1.0.0, is the exception: `packages/hl7-to-fhir/package.json` already has that version, so there is
no version bump, the changelog entry is written by hand, and the maintainer verifies the package with `pnpm build` and
`npm publish --dry-run` before pushing the tag `v1.0.0`.
