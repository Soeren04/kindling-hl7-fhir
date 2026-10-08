# 0007. API report without API Extractor

- Status: accepted
- Date: 2026-10-08
- Implementation: planned (added with the first public entry points; the API freeze review is phase 5)

## Context

The first release is 1.0.0, so every accidental change to the public API after it is a breaking change that needs a
major version. Reviewers must see every API change in the diff, and every export must be documented with an
example. API Extractor is the usual tool, but it handles one entry point per configuration (we have two) and
typically lags new TypeScript versions.

## Decision

- The bundled declaration files of both entry points (`index.d.ts`, `hl7v2.d.ts`) are committed under
  `packages/hl7-to-fhir/api/`. CI builds the package and fails if the declarations differ from the committed ones,
  so every API change shows up in the pull request diff and needs a deliberate update of the snapshot.
- TypeDoc with `validation.notDocumented` and `treatValidationWarningsAsErrors` fails on undocumented exports.
- A small script fails when an exported function lacks an `@example` block.

## Alternatives considered

- **API Extractor.** One config and report per entry point, a separate TypeScript version inside the tool, and a
  report format that is less readable than the declarations themselves.
- **No API snapshot, review only.** Changes to inferred types (for example a widened return type) are invisible in
  the source diff.

## Consequences

- API changes are explicit and reviewable; the snapshot doubles as a readable reference of the public surface.
- The snapshot depends on tsdown's declaration output format, so a tsdown upgrade can change it without an API change;
  such updates are reviewed and committed like any other snapshot change.
