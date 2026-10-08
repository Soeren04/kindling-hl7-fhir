# 0003. Lenient parsing, strict validation

- Status: accepted
- Date: 2026-10-08
- Implementation: planned (phase 1: lenient `parse` and issue codes; phase 2: `validate`)

## Context

Real HL7 v2 feeds deviate from the standard all the time: `\n` instead of `\r` as segment terminator, MLLP framing
characters or a byte order mark left in the text, a shortened MSH-2, trailing whitespace, unknown escape sequences,
local Z segments. Interface engines such as Mirth Connect and Rhapsody accept such messages and let routes decide
what to reject. A parser that refuses them is unusable on real data; a parser that silently repairs them hides
problems from the people who must fix the sending system.

## Decision

Parsing is lenient and reports what it tolerated. `parse` returns an error only when the input cannot be read as HL7
v2 at all (no `MSH` segment, no usable field separator, duplicate or alphanumeric delimiters). Everything else is
parsed, and every deviation becomes an `Issue` with a stable code and an exact location. Validation is a separate,
explicit step (`validate`) that checks structure, cardinality, required fields, formats and table values against
v2.5.1 and reports all findings at once.

## Alternatives considered

- **Strict parsing (reject on the first deviation).** Rejects most production messages and reports one problem at a
  time.
- **Silent repair.** Convenient, but users cannot see or measure what was changed, and conversions of broken input
  would look trustworthy.

## Consequences

- Users choose their own policy: convert anyway, block on issues of severity `error`, or log and continue.
- Every tolerance needs an issue code, documentation and a test. The issue codes become public API (ADR 0004).
