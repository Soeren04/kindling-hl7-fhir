# 0002. One published package, boundaries enforced by tooling

- Status: accepted
- Date: 2026-10-08
- Implementation: implemented (the checks run in CI against the fixtures in `tooling/`; the `cli`, `hl7v2` and
  `fhir` sources they guard are added in later phases)

## Context

The code has three layers with strict dependency rules: HL7 v2 parsing and validation must be usable without FHIR,
FHIR mapping builds on HL7 v2, and only the CLI may touch Node APIs, because the library runs in browsers too. Users
should get started with one command, `npm install hl7-to-fhir`.

## Decision

Publish a single package, `hl7-to-fhir`, with one entry point per audience (`hl7-to-fhir` for conversion,
`hl7-to-fhir/hl7v2` for parsing) and a `bin` for the CLI. The playground and the documentation are private workspace
packages. The layer rules are enforced by CI-blocking tools instead of package boundaries:

- **dependency-cruiser** (`.dependency-cruiser.mjs`): `shared/` imports nothing else, `hl7v2/` imports only
  `hl7v2/` and `shared/`, `fhir/` only `fhir/`, `hl7v2/` and `shared/`; nothing outside `cli/` imports `cli/` or a
  Node built-in module; no cycles (type-only imports included); library sources import no devDependency.
- **TypeScript**: `tsconfig.lib.json` checks every library source except `src/cli` with `"types": []` and
  `lib: ["ES2022"]`, so `process`, `Buffer`, `window` or `document` are compile errors there. dependency-cruiser
  cannot see ambient globals; this config can.
- **ESLint** `no-restricted-globals` and `no-restricted-imports` in the same folders, as a second line of defense
  with an explanatory message at the exact line.

Each rule has a fixture in `tooling/fixtures` and a test in `tooling/` proving that it fires, so a rule cannot
silently stop working.

## Alternatives considered

- **Four packages (`core`, `fhir-mapper`, `cli`, `web`).** Requires an npm scope, lockstep versioning and makes users
  choose packages. Package boundaries also only stop imports of undeclared dependencies; they do not stop Node
  globals or cycles inside a package.
- **Convention and code review only.** Boundaries erode one convenient import at a time; a tool fails the build at
  the line that breaks the rule.

## Consequences

- One install, one version, one changelog. The HL7-only entry point is a separate bundle, so parsing alone does not
  load the FHIR mapping code.
- The rules live in configuration that must match the folder layout. The path patterns (`(^|/)src/hl7v2/`) are shared
  by the real package and the fixtures, and the fixture tests catch drift.
