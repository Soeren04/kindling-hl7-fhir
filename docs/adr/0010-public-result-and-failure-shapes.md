# 0010. Public result and failure shapes

- Status: accepted
- Date: 2026-10-09
- Implementation: complete (`parse`, `stringify`, `parsePath` and `splitBatch` follow the rule, `Issue.location` is
  required, and the code unions are documented and checked)

## Context

[ADR 0004](0004-result-and-issues.md) decided that expected failures are returned as `Result` values and that
tolerated deviations are reported as `Issue` lists. The first public functions then each grew their own shape: `parse`
returned a failure that carried issues, `parsePath` returned an error named with another suffix, `stringify` borrowed
issue codes, and the batch splitter had a third way to report what it dropped. Before 1.0.0 the shapes are cheap to
change; afterwards every name is a promise.

Callers write code against these shapes in many places, so what they have in common matters more than what each
function needs: one way to tell success from failure, one place to find the machine-readable reason, one place to
find the human-readable one, and one rule for where the context goes.

## Decision

**Which functions fail how.** A function returns a `Result` only when its input can be unusable in a way the caller
should handle. Everything else returns plain values.

| Function                  | Returns                                      | Fails                                        |
| ------------------------- | -------------------------------------------- | -------------------------------------------- |
| `parse`                   | `Result<ParseSuccess, ParseFailure>`         | when the input is not an HL7 v2 message      |
| `stringify`               | `Result<string, StringifyFailure>`           | when the tree cannot be written faithfully   |
| `parsePath`               | `Result<ParsedPath, PathFailure>`            | when the path is malformed                   |
| `splitBatch`              | `{ messages, issues }`                       | never: what it drops or doubts is an `Issue` |
| `get`, `getAll`, `isNull` | `string \| undefined`, `string[]`, `boolean` | never: a path that matches nothing is empty  |

None of them throws for any input, including values of the wrong type from plain JavaScript; a non-string input is an
`INVALID_INPUT` failure or issue.

**Failure shape.** Every failure type is named `…Failure` and has the same first two properties:

- `code`: a member of a closed union of string literals, named `…FailureCode`. It is the discriminant callers switch on.
- `message`: a description in terms of the standard that never contains message content, so it is safe to log.

A failure then carries one more property, named for what it locates, because the three failures locate different
things:

- `ParseFailure.issues`: the issues found up to the failure, ending with the one that stopped parsing, whose `code`
  equals the failure's. Its locations point into the input text.
- `StringifyFailure.location`: the `Location` of the offending node in the tree (its segment, field, repetition,
  component and subcomponent), with the span the tree gives it. `stringify` checks the tree before it writes and
  fails with one of its own codes instead of returning text that reads back as another tree.
- `PathFailure.span`: the offending part of the path string, as offsets into it.

A new failure follows the rule: `code`, `message`, and a locator named for what it locates, never a generic `details`
or `context`.

**Codes.** `IssueCode` contains exactly the codes that appear in an `Issue`. The codes of a failure that is not an
issue (`StringifyFailureCode`, `PathFailureCode`) are their own unions, each with its own message table next to the
code that raises them. A code name that exists in several unions (`INVALID_INPUT`, `INVALID_SEGMENT_ID`,
`MISSING_MSH`) means the same thing in each; a different meaning gets a different name.

**Issues.** `Issue.location` is required: every issue has a `Location`, and an issue about the input as a whole has
only a span. A `Location` numbers positions as HL7 notation does (1-based), except `segmentIndex`, which is a 0-based
index into `message.segments`; the rule for every public name is that `…Index` is a 0-based array index and every
other position is 1-based. `ParsedPath` follows it.

**Documentation of codes.** The declaration bundler drops the comments on the members of a union, so each code union
carries a TSDoc list of every code with a short meaning, and `IssueCode` also gives the severity. `pnpm check:api`
fails when the shipped declarations list a code the union does not contain or miss one it does, and a test compares
the severities in the `IssueCode` list with the issue table.

## Alternatives considered

- **Throwing for invalid input, returning `Result` only for the content.** Callers in plain JavaScript pass `undefined`
  and `Buffer` often; a `TypeError` from deep inside the parser is a worse message than `INVALID_INPUT`.
- **One `Failure` type for every function.** It would need a `context` of changing meaning, which loses the point of
  naming the locator: `failure.span` can be sliced from the path, `failure.location.field` read from the tree.
- **Keeping the stringify codes in `IssueCode`.** It kept one table, but `IssueCode` then listed codes that no `Issue`
  ever has, and a caller who exhausts the union in a `switch` over `issue.code` had to handle them.
- **`splitBatch` as a `Result`.** There is no input it cannot split: text without a message yields no messages and an
  issue. A `Result` would add a branch that never fails.
- **Generating the code documentation from the issue table.** It cannot go stale, but the generated block has to be
  committed or built, and the meanings are written for readers of the type, not for the people who read log lines. The
  check keeps a hand-written list honest instead.

## Consequences

- A caller handles every failure the same way: test `ok`, switch on `error.code`, log `error.message`, and use the
  locator to underline the cause.
- Adding a code to a failure union is a minor release, removing or renaming one a major release, as for issue codes.
- Two unions may share a name, so a test that compares codes across unions must compare the unions, not the names.
- The code lists in the TSDoc are written twice (the union and the list) and checked for agreement in `check:api`;
  a new code needs both.
