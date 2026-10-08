# 0008. Message model and field indexing

- Status: accepted
- Date: 2026-10-08
- Implementation: implemented (`src/hl7v2/model.ts` and `src/hl7v2/parse.ts` implement the model; the benchmark in
  `packages/hl7-to-fhir/bench` measured the span representation and kept it, see "Span representation")

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

## Span representation

The plan left open whether every node should carry a span object or whether the offsets should be packed into one
`Int32Array` per message. The parser was measured as built (`pnpm bench`, `pnpm bench:memory`; numbers and method in
`packages/hl7-to-fhir/bench/README.md`, Intel Xeon 2.8 GHz, Node.js 22.22.0):

- An ADT^A01 (0.6 KB) parses in 0.04 ms, an ORU^R01 with 50 OBX (3.1 KB) in 0.25 ms, and the worst 1 MB inputs in
  0.02 to 0.3 s.
- The retained tree is about 160 times the size of the input for segment-heavy messages (498 KB for the ORU with 50
  OBX, 159 MB for 1 MB of OBX), about 113 bytes per tree object.

To see how much the spans cost, a throwaway build of the parser stored one shared constant instead of a span object
at every node (what the best packed representation could save at most, since it would still need an offset per
node), and the same inputs were measured with `node --expose-gc` on the built bundle:

| Input       | Time with span objects | Time without | Heap with span objects | Heap without |
| ----------- | ---------------------: | -----------: | ---------------------: | -----------: |
| ADT^A01     |                38.5 us |      36.1 us |                  64 KB |        53 KB |
| ORU, 50 OBX |                 238 us |       207 us |                 427 KB |       353 KB |
| ORU, 1 MB   |                 289 ms |       211 ms |                 158 MB |       131 MB |

Removing the spans entirely saves 6 to 27 % of the time and about 17 % of the memory. The rest is the nesting itself:
every field is an object holding an array of repetitions, each holding an array of components, and so on.

**Decision: keep span objects.** The most a packed alternative can win is below a third of the time and a fifth of the
memory, and it would cost what this model was chosen for: `span` would no longer be a plain property of a plain
object, so trees would stop being comparable with `toStrictEqual`, and views onto a shared array would not survive
`structuredClone` or `postMessage` without copying the array separately. Typical messages (up to some tens of
kilobytes) parse in under a millisecond and retain a few megabytes, and 1 MB inputs finish in well under a second,
so there is no problem the change would solve. A change of the model that removes nesting levels (for example,
collapsing fields with a single repetition) would gain much more than any span encoding; it is a breaking change of
the public shape and is not planned.

## Consequences

- One indexing rule for every segment, MSH included; walking the tree needs no special cases, and `get` hides the
  `n - 1` for users who prefer HL7 notation.
- The tree is larger than bare arrays: one object and one span per node, about 150 times the size of the input for
  ordinary messages (see "Span representation").
- Formatting that has no plain-text equivalent (highlighting, indentation) is lost from values. It is reported, and
  consumers that need it read the raw text through the span.
- Trimming trailing empties makes `stringify` canonical: it cannot reproduce trailing delimiters, so
  `stringify(parse(x)) === x` holds for canonical input only.
