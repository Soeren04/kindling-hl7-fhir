# 0001. Handwritten HL7 v2 parser

- Status: accepted
- Date: 2026-10-08
- Implementation: planned (phase 1: parser, property tests and benchmark; mutation testing follows)

## Context

HL7 v2 is a delimiter-based format with a small grammar and many sharp edges: delimiters declared inside the first
segment (MSH-1 and MSH-2, which must not be split or unescaped), escape sequences that depend on the message version
and character set, the difference between an empty field and the explicit null `""`, repetitions, and segment
terminators that real feeds send as `\r`, `\n` or `\r\n`. The library must run in browsers and Node with zero runtime
dependencies, and its diagnostics and the playground need exact character spans for every node.

## Decision

Write the parser by hand as a single forward pass over the input string. It records a span (start and end offset)
for every segment, field, repetition, component and subcomponent, uses no regular expression on unbounded input,
and never recurses, so its run time and stack depth are linear in the input size and independent of its shape.

## Alternatives considered

- **An existing JavaScript HL7 v2 parser.** The maintained ones are Node-only or transport-focused, none exposes
  spans for every node, and each would become a runtime dependency.
- **A parser generator (PEG, parser combinators).** The grammar is not the hard part; the special cases (MSH-1/MSH-2,
  version-dependent escapes, lenient terminators) would be written as hand-coded exceptions inside a generated
  parser, and generated parsers make linear-time guarantees and span bookkeeping harder to see.
- **`split` on delimiters.** Loses spans, cannot treat MSH-1/MSH-2 specially without re-parsing, and allocates
  intermediate arrays for every level.

## Consequences

- Full control over spans, diagnostics and performance, and no dependency to audit or upgrade.
- More code to test. This is mitigated by property-based tests (round trips, "never throws", every span slices back
  to its raw text), golden parse trees, a 1 MB input test for linear behavior, a benchmark, and mutation testing of
  `src/hl7v2`.
