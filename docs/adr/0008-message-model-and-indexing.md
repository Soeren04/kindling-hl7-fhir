# 0008. Message model and field indexing

- Status: accepted
- Date: 2026-10-08
- Implementation: implemented (`src/hl7v2/model.ts`, `src/hl7v2/parse.ts`); the span representation is measured by the
  phase 1 benchmark

## Context

`parse` returns the message as data that users walk directly, that `get`, `stringify`, validation and the FHIR
mapping build on, and that the playground sends from a Web Worker. Several forces meet in its shape:

- HL7 v2 numbers fields, components and subcomponents from 1 (`PID-5.1`), JavaScript arrays from 0.
- In MSH, the field separator itself is MSH-1 and the encoding characters are MSH-2, so a naive split on `|` puts
  MSH-2 at the position where every other segment has field 1.
- HL7 distinguishes "not sent" (an empty field) from the explicit null `""` (delete the value), and trailing empty
  fields and components carry no information.
- Diagnostics and the playground need the exact input range of every node, including empty ones.
- Escape sequences depend on the delimiters and the character set, while the data type of a field, which decides
  whether formatting commands such as `\.br\` apply, is unknown to the parser.
- The tree must survive `structuredClone`, `postMessage` and JSON.

## Decision

- **Plain readonly objects at every level.** A message has `delimiters`, an optional `version` and `segments`. A
  segment has an `id` and `fields`, a field has `repetitions`, a repetition `components`, a component
  `subcomponents`, and a subcomponent is a union discriminated by `kind`. Every node has a `span` with offsets into
  the string passed to `parse`, so `input.slice(span.start, span.end)` is the node's raw text even when a byte order
  mark or MLLP framing was removed. No classes, no methods, no `Map`s.
- **0-based arrays, documented once: `fields[n - 1]` is field `n`.** The same rule holds for components
  (`components[n - 1]`) and subcomponents. MSH follows it too: `fields[0]` is MSH-1, a single value holding the field
  separator, and `fields[1]` is MSH-2, a single value holding the encoding characters, neither split nor unescaped.
  HL7's 1-based numbers appear where users write or read HL7 notation: in `Location` (`field: 5` is PID-5) and in the
  path accessors (`get(message, "PID.5.1")`, phase 1).
- **Empty, null and absent.** An empty field, repetition or component has no children (`[]`). A subcomponent has no
  children to leave out, so an empty one between siblings (`a&&c`) is `{ kind: "empty" }`, keeping the positions of
  later siblings. `""` is `{ kind: "null" }`. Trailing empty children are trimmed when their parent closes; the parent
  span still covers them.
- **Values are decoded text.** A `value` subcomponent holds the text a reader sees: delimiter, truncation and
  hexadecimal escapes are decoded (hexadecimal ones in the MSH-18 character set), `\.br\` and `\.sp\` become `"\n"`,
  highlighting and the other formatting commands are removed, and sequences that cannot be interpreted stay verbatim.
  Every case other than delimiter escapes and line breaks is reported as an issue. The raw text is always available
  through the span.
- **Locations never carry content.** `Location.segmentId` is set only for a valid segment identifier; the raw text of
  an invalid one is in `Issue.value`, like every other raw value.

## Alternatives considered

- **A placeholder at index 0 (`fields[n]` is field `n`).** Natural indexes, but the placeholder must be a hole or a
  dummy node: a hole turns into `null` in JSON, so a round trip changes the tree; every loop has to skip index 0;
  `fields.length` is one more than the number of fields; and iteration helpers see the placeholder.
- **The segment identifier as field 0**, as in some other parsers. It repeats `id`, mixes a non-field into the field
  list, and only works for MSH if MSH-1 is inserted artificially anyway.
- **Bare nested arrays** (`Field = readonly Repetition[]`) with spans only on segments and subcomponents, as first
  sketched in the plan. Smaller, but empty fields and components would have no span, so diagnostics could not point at
  them, and the property "every node's span slices back to its raw text" could not be stated.
- **Keeping escape sequences in values** and decoding on access. The parser would not need to choose a rendering, but
  after `\E\` is decoded a literal backslash cannot be told apart from an escape sequence, so a raw form and a decoded
  form would both have to be stored or recomputed from the span on every access.

## Consequences

- One indexing rule for every segment, MSH included; walking the tree needs no special cases, and `get` hides the
  `n - 1` for users who prefer HL7 notation.
- The tree is larger than bare arrays: one object and one span per node. The phase 1 benchmark compares span objects
  with a packed representation; the public shape `span: { start, end }` stays either way.
- Formatting that has no plain-text equivalent (highlighting, indentation) is lost from values. It is reported, and
  consumers that need it read the raw text through the span.
- Trimming trailing empties makes `stringify` canonical: it cannot reproduce trailing delimiters, so
  `stringify(parse(x)) === x` holds for canonical input only.
