# Contributing to hl7-to-fhir

Thank you for helping. This guide covers the setup, the quality gates every change passes, and the conventions for
commits, changesets and test data. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Synthetic data only

Issues, pull requests, tests, samples and documentation must only contain **synthetic** HL7 messages and FHIR
resources. Use the fictional names from the HL7 standard (for example `Everyman^Adam` and `Everywoman^Eve`),
`example.org` systems and obviously fake identifiers. Never paste real patient data, not even "just for a minute".
If it happens anyway, follow [Patient data posted by mistake](SECURITY.md#patient-data-posted-by-mistake).

## Setup

You need Node.js 22.18 or newer (the version in [`.nvmrc`](.nvmrc) is recommended) and pnpm, which Corepack provides
in the version pinned in `package.json`:

```sh
corepack enable
pnpm install
pnpm verify:fast
```

Checking the GitHub workflows (`pnpm lint:workflows`, part of `pnpm verify`) additionally needs Go and pipx. zizmor
runs its online audits only when `GH_TOKEN` is set.

## Repository layout

| Path                   | Contents                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `packages/hl7-to-fhir` | The published library: `src/` sources, `test/` unit, type and FHIR tests |
| `tooling/`             | Tests proving that the lint and boundary rules fire, with their fixtures |
| `scripts/`             | Small, tested Node scripts used by CI and the release                    |
| `docs/adr/`            | Architecture decision records                                            |
| `.github/workflows/`   | CI, release and FHIR validator workflows                                 |

The architecture boundaries are enforced, not just documented: `src/hl7v2` knows nothing about FHIR, `src/fhir`
builds on `src/hl7v2`, and only `src/cli` may use Node APIs. See [ADR 0002](docs/adr/0002-single-package-with-tooling-boundaries.md).

## Scripts

| Script                | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `pnpm format`         | Formats everything with Prettier                                           |
| `pnpm lint`           | ESLint with zero warnings allowed                                          |
| `pnpm typecheck`      | `tsc` for every config, including the Node-free library config             |
| `pnpm test`           | Vitest: library and tooling tests                                          |
| `pnpm test:coverage`  | Tests with coverage; fails below 95 % on the library                       |
| `pnpm depcruise`      | Checks the layer boundaries with dependency-cruiser                        |
| `pnpm knip`           | Finds unused files, exports and dependencies                               |
| `pnpm build`          | Builds the library (ESM, CommonJS and declarations) with tsdown            |
| `pnpm check:package`  | publint, Are the Types Wrong, tarball contents and `npm publish --dry-run` |
| `pnpm lint:workflows` | actionlint and zizmor on the GitHub workflows                              |
| `pnpm verify:fast`    | Format check, lint, typecheck and tests: run before every commit           |
| `pnpm verify`         | Everything CI runs                                                         |

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`
with one of the types `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style` or
`revert`. The description is imperative, starts lowercase, has no trailing period, and the subject line is at most 72
characters. A body is welcome when the _why_ is not obvious.

Keep commits small and atomic. **Every commit must pass `pnpm verify:fast` on its own**: CI replays each commit of a
pull request and runs the fast gates on it, and pull requests are merged with rebase, so every commit lands on `main`
unchanged. Commit tests together with the code they test.

## Changesets

Every pull request that changes the published package adds a changeset:

```sh
pnpm changeset          # describe a user-facing change and choose patch, minor or major
pnpm changeset --empty  # for changes that need no release note, such as tooling or tests
```

CI requires a changeset whenever `packages/hl7-to-fhir/src` changes.

## Pull requests

Open the pull request from a branch named `feat/…`, `fix/…`, `docs/…`, `chore/…`, `test/…` or `refactor/…` and fill
in the template. Every pull request needs a green CI run and a completed review gate before it is merged.

## Releases

Releases are cut by the maintainer: a `chore(release): vX.Y.Z` pull request runs `pnpm changeset version`, and after it
is merged the maintainer pushes the tag `vX.Y.Z`. The release workflow checks that the tag matches the package
version, runs the gates again and publishes to npm with provenance.
