# 0003. Lenient parsing, strict validation

- Status: accepted
- Date: 2026-10-08
- Implementation: implemented (`parse` and its issue codes; `validate`, see [ADR 0011](0011-structures-groups-and-validation.md))

## Context

Real HL7 v2 feeds are assumed to deviate from the standard regularly: `\n` instead of `\r` as segment terminator, MLLP framing
characters or a byte order mark left in the text, a shortened MSH-2, trailing whitespace, unknown escape sequences,
local Z segments. A parser that refuses them is of little use on such data; a parser that silently repairs them hides
problems from the people who must fix the sending system. The split between a tolerant parse and an explicit
validation step follows from that.

## Decision

Parsing is lenient and reports what it tolerated. `parse` returns an error only when the input cannot be read as HL7
v2 at all (no `MSH` segment, no usable field separator, duplicate or alphanumeric delimiters). Everything else is
parsed, and every deviation becomes an `Issue` with a stable code and an exact location. Validation is a separate,
explicit step (`validate`) that checks structure, cardinality, required fields, formats and table values against
v2.5.1 and reports all findings at once.

Tolerance stops where the standard gives characters a meaning. Two cases need care:

- **Segment terminators.** The terminator of MSH decides. If MSH ends with `\n`, every `\r`, `\n` and `\r\n` ends a
  segment, so files converted to Unix line endings keep working. If it ends with `\r` or `\r\n`, a line feed on its
  own is data, as the standard defines only the carriage return as terminator; it stays in its value with an info
  issue (`LINE_FEED_IN_SEGMENT`). Only a line feed at the very end of the input still ends the last segment, because
  editors add one.
- **Trailing whitespace.** Whitespace and blank lines after the final terminator are removed. Spaces and tabs before
  it belong to the last value of the last segment and stay, as they would in any other segment.

## Alternatives considered

- **Strict parsing (reject on the first deviation).** Rejects most production messages and reports one problem at a
  time.
- **Silent repair.** Convenient, but users cannot see or measure what was changed, and conversions of broken input
  would look trustworthy.

## Consequences

- Users choose their own policy: convert anyway, block on issues of severity `error`, or log and continue.
- Every tolerance needs an issue code, documentation and a test. The issue codes become public API (ADR 0004).
