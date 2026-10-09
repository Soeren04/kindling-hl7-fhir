# 0004. `Result` for failures, `Issue` lists without PHI

- Status: accepted
- Date: 2026-10-08
- Implementation: partial (`Result` and `Issue` exist in `src/shared/`, and the parser tests check that
  issue messages contain no message content; the CLI output rule follows in phase 4)

## Context

Conversion has two kinds of outcome that callers must handle differently: "could not do it" (the input is not HL7
v2) and "did it, with remarks" (a field was truncated to a date, a code was unknown). Exceptions hide the first kind
from the type system and cannot express the second. HL7 messages contain protected health information (PHI), and
error messages end up in logs, monitoring systems and bug reports.

## Decision

- Operations that can fail in an expected way return `Result<T, E>`, a discriminated union of
  `{ ok: true, value }` and `{ ok: false, error }` (`src/shared/result.ts`). Errors are discriminated unions on
  `code`. The internal constructors `ok()` and `err()` are not part of the public API.
- Successful operations report remarks as a readonly array of `Issue = { code, severity, message, location, value? }`.
- Exceptions are reserved for programmer errors the types already rule out. User hooks run inside a guard that turns
  a throw into an error result.
- **`Issue.message` never contains message content.** It describes the problem in terms of the standard ("PID-7 is
  not a valid DTM"). The offending raw value is only available in the separate `value` property, documented as
  potential PHI, so callers can log messages safely and decide deliberately whether to log values. The same rule
  applies to CLI output on stderr.
- **One table defines every code.** Each `IssueCode` has exactly one severity and one message
  (`src/shared/issue.ts`); call sites name only the code, the location and the raw value, so a code never changes its
  severity with the place that reports it.
- **At most 10,000 issues per call.** Hostile input can produce an issue every few characters. After 10,000 issues a
  function stops collecting and ends its list with one `TOO_MANY_ISSUES` warning, located at the end of the input so
  that the list stays in input order. Issues are collected with `push`, never by spreading arrays into a call, which
  throws a `RangeError` once an array has more than about 100,000 elements.

## Alternatives considered

- **Throwing exceptions.** Invisible in signatures; one failure at a time; no channel for warnings.
- **A Result library (`neverthrow`, `effect`).** Adds a runtime dependency and a programming model users must learn
  for two object shapes.
- **Including the value in messages.** Easier debugging, but every log line could leak PHI.

## Consequences

- Callers handle failures with an `if (result.ok)` check that TypeScript enforces; results are plain data that
  survive `structuredClone`, `postMessage` and JSON.
- Issue codes are public API: adding a code is a minor release, renaming or removing one is a major release.
- Tests check that issue messages never contain the synthetic names and identifiers of the input message.
