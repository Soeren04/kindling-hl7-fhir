# 0009. Paths and their types

- Status: accepted
- Date: 2026-10-08
- Implementation: partial (`parsePath`, `get`, `getAll`, `isNull` and the shallow literal check are implemented; the
  `KnownPath` autocompletion needs the segment definitions of phase 2)

## Context

Users read values with HL7 notation (`PID.5.1`) instead of walking the tree of [ADR 0008](0008-message-model-and-indexing.md).
Paths arrive in two ways: as literals in source code, where a typo should fail at compile time, and as strings from
configuration or user input, which must never throw. Two forces pull against each other. Autocomplete and compile-time
errors need type-level work, but template-literal types that parse a path are costly for every consumer's type
checker, and the set of segments and fields is only known once phase 2 adds the segment definitions.

## Decision

- **Grammar:** `SEG[n].F[r].C.S`. The segment and the field may carry a 1-based repetition index in brackets; the
  component and subcomponent may not. A path names at least a field. Numbers are positive whole numbers without leading
  zeros. `parsePath` returns a `Result` with a `PathError` (`code`, `message`, `span` into the path) and never throws.
- **Indexing:** `SEG-n` is `fields[n - 1]`, as in ADR 0008, so `MSH.1` is the field separator and `MSH.2` the encoding
  characters. `OBX[3]` is the third `OBX` segment counted over the whole message, not within a group.
- **`get`:** a segment without index is the first segment of that identifier; a field without index is its first
  repetition; a path that stops early continues with the first component and the first subcomponent. It returns the
  decoded text of a `value` subcomponent and `undefined` for the explicit null, an empty position and a missing one.
- **`getAll`:** the same selection without the "first" defaults: an unindexed segment selects every segment with the
  identifier, an unindexed field every repetition. Each selected repetition yields what `get` would return for it, and
  positions without text are skipped, so the result is the list of values in message order. When `get` returns text,
  `getAll(...)[0]` is the same text.
- **`isNull`:** true only when the whole position the path names is the explicit null `""` (HL7 v2.5.1 section
  2.5.3), which is how callers tell "delete this" from "not sent". A path to a field or repetition is null when the
  repetition is exactly one component holding one null subcomponent; a path to a component when that component is
  exactly one null subcomponent; a path to a subcomponent when it is the null. So `""^Adam` is not null at `PID.5`,
  although `PID.5.1` is. Following `get` into the first component would call a field null whose other components
  carry values, and a receiver acting on that would delete data the sender sent.
- **Cost:** `get` and `isNull` scan the segments from the start and stop at the one they read, so a call costs the
  position of its segment, not the size of the message. `getAll` reads in one pass and is the way to go through
  every repetition or segment; the accessors keep no hidden caches, as the tree is plain data (ADR 0008).
- **Malformed runtime paths** make `get` return `undefined`, `getAll` return `[]` and `isNull` return `false`.
  `parsePath` is the place to ask why. The path is never echoed in a message, because a caller may have built it from
  data.
- **Types:** the three accessors are generic, `get<P extends string>(message, path: Hl7Path<P>)`. `Hl7Path` is `string`
  when used bare. With the inferred literal it is the literal itself when the shape is valid and a string literal
  type describing the problem otherwise, so the compiler reports `Argument of type '"PID..5"' is not assignable to
parameter of type '"Invalid HL7 path: a field is a positive number"'`. The check validates the segment (three
  characters, upper case), the numbers and the position of the indices, by splitting the literal at dots and
  brackets. It accepts every string that is not a literal.
- **Cost is a gated number.** `pnpm check:type-performance` compiles a fixture of about sixty path calls and fails when
  the instantiations exceed a budget (about 50 instantiations per checked literal; the budget is set slightly above the
  measurement and ratcheted down when the types get cheaper).

## Alternatives considered

- **A union of all known paths** (`KnownPath | (string & {})`). It autocompletes, but it needs the segment
  definitions, which arrive in phase 2, and a union of every field of every segment, with components, has thousands of
  members. The shallow check does not depend on them, and `Hl7Path<P>` can take the union later as the constraint of
  `P` without changing any call.
- **A template-literal type such as `` `${string}.${number}` ``.** Cheap, but `PID..5` matches it (the segment is
  `PID.`), and `${number}` accepts `1e3`, `-1` and `1.5`. A recursive check on the literal is just as cheap for the
  short strings paths are.
- **Throwing on malformed paths.** The caller of `get` usually has a path from configuration; a typo should not crash
  a conversion. `Result` from `parsePath` keeps the explanation available (ADR 0004).
- **Making `getAll` mirror `get` position by position,** returning `undefined` entries for empty positions. That keeps
  indexes aligned with repetitions, but callers nearly always want the values; those who need alignment walk the tree.
- **Flat or group-relative segment indices.** Group-aware access needs the structure definitions of phase 2 and
  belongs to the validation result, not to a path string.

## Consequences

- Reading a value is one call with the notation of the specification; typos in literals fail at compile time with a
  readable message, and dynamic strings keep working.
- A path that does not parse silently reads nothing at runtime. Callers who want certainty validate with `parsePath`.
- The compile-time check is shallow: it cannot tell that `PID.99` does not exist. Phase 2 can narrow it.
- Every literal costs the type checker a few dozen instantiations, which the budget keeps from growing unnoticed.
- `getAll` skips empty positions, so the position of a value in the result does not give its repetition number.
