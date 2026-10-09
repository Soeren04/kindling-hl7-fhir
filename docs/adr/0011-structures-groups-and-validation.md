# 0011. Message structures, segment groups and validation

- Status: accepted
- Date: 2026-10-09
- Implementation: implemented (`src/hl7v2/structure.ts`, `group.ts`, `validate.ts`, `define-segment.ts` and
  `validate/`; the rules and codes are listed in [`docs/validation-rules.md`](../validation-rules.md))

## Context

[ADR 0003](0003-lenient-parse-strict-validate.md) split reading a message from judging it: `parse` tolerates, and a
separate `validate` reports everything that deviates from HL7 v2.5.1. Validation needs to know which message structure
a message follows, how its segments fall into the groups of that structure (an ORU^R01 is a list of patient results,
each a list of orders, each a list of observations), and which fields, types and tables each segment has. The FHIR
mapping of phase 3 needs the same grouping to turn an order and its observations into a DiagnosticReport and its
Observations.

Several forces meet:

- Messages come from untrusted senders. Matching segments against a structure must take time linear in the number of
  segments, without recursion over the input or regular expressions on it.
- Real messages contain Z segments, segments from later versions and misplaced segments. A segment must never be
  lost: the mapping, the playground tree and the user all need every segment.
- [ADR 0004](0004-result-and-issues.md) gives each issue code exactly one severity. The plan asked for version-specific
  rules to be "downgraded to info" for versions other than 2.5.x, which would give one code two severities.
- The library ships only the definitions it needs ([ADR 0005](0005-hl7-content-licensing.md)): ten segments, the
  structures ADT_A01 and ORU_R01, and nine tables. Users need to describe their own Z segments without forking.

## Decision

**Structure resolution.** The structure is MSH-9.3 when it holds text, otherwise the one MSH-9.1 and MSH-9.2 imply:
`ACK` for an acknowledgment, whatever event it acknowledges, and for other messages the one HL7 table 0354 assigns to
the message code and trigger event (`ADT^A04` is `ADT_A01`). A message whose MSH-9 identifies no structure gets the
warning `MESSAGE_STRUCTURE_UNKNOWN`; a structure the library has no definition of gets the note
`MESSAGE_STRUCTURE_UNSUPPORTED`. When all three components are present and MSH-9.3 names another structure than the
other two imply (`ADT^A04^ORU_R01`), the message contradicts itself: that is the error `MESSAGE_STRUCTURE_MISMATCH`,
and the segments are matched against the structure MSH-9.3 names, the one the sender declares. None of these is a
failure: the segments are still returned and the field rules still run.

**`group` is public.** `group(message, options?)` returns `MessageGroups`: the resolved `structure`, the tree of
`children` and the `issues` about the segment order. A group is `{ kind: "group", name, children }`, a segment is
`{ kind: "segment", segmentIndex }`, an index into `message.segments`. The tree references segments instead of
copying them, so it is small, plain data like the message (it survives `structuredClone` and JSON), and the segment
objects keep a single identity. Every segment appears exactly once, in message order; a property test checks it.

**The matcher.** It walks the segments once and keeps one frame per open group: the element the last segment matched,
how often it occurred, and which elements the occurrence has seen. For each segment it looks for a place in the
innermost open group first and then outward: the current element again when it repeats, otherwise the next element
that can start with the segment (a segment of that identifier, or a group whose elements up to its first required one
can). Committing a match closes the inner groups and reports the required elements skipped on the way
(`SEGMENT_MISSING`, located by an empty span where the segment belongs and the expected identifier in `segmentId`).

A segment that is present is never reported as missing. Before committing a match that skips a required segment, the
matcher looks up whether a segment of that identifier comes later (one map from identifier to last index, built in one
pass); if one does, the segment at hand is the one out of place, so `MSH EVN PID OBX PV1` reports OBX as out of order
instead of PV1 as missing. A segment that is not placed does not change the state: it goes into the innermost open
group and is reported as `SEGMENT_REPEATED` when an open group has already seen an element that occurs at most once and
that the segment would start again (a second PID, a second MSH, an ORC before its order's OBR), as
`SEGMENT_OUT_OF_ORDER` otherwise when the structure contains its identifier, as `UNEXPECTED_SEGMENT` (warning) when it
does not, and as `UNDEFINED_Z_SEGMENT` (note) for a Z segment. A segment reported as out of order or repeated is also
not reported as missing when its group ends. A segment with a caller definition that the structure does not contain
is allowed anywhere.

The matcher is greedy and never backtracks: a segment that is valid in several places belongs to the first one the
segments before it leave open, so an NTE after an OBX belongs to that OBX's `OBSERVATION`, where the abstract message
syntax lists it. The cost per segment is bounded by the size of the structure, not of the message, and the only
recursion is over the fixed, few-level definitions.

**`validate(message, options?)` returns `readonly Issue[]`** and never throws. It reports the issues of `group`, then
checks every segment that has a definition with one rule per module (`validate/rules/`): required fields,
repetitions, fields after the last defined one or marked as not used (`X`), components and subcomponents a data type
does not define, the formats of NM, SI, DT, DTM (and TS.1), TM, ID and IS, and the codes of the shipped tables.
Issues are sorted by position and capped as in ADR 0004, and the cap keeps the first 10,000 in message order: the
issues of `group` and those of the segment rules are collected apart, each rule finds the issues of a segment in
message order, the segment's issues are merged before they are cut, and no rule runs once the cap is reached. Every
rule, including the checks of the message shape, the definitions, the structure and the version, is described in a
module of `validate/rules/` with a summary and its codes; `pnpm update:validation-rules` generates
`docs/validation-rules.md` from them, and a test fails when the committed page differs. The issue `value` may hold
patient data (a malformed date of birth); like every value of the library, it must not be logged where patient data
may not go, as SECURITY.md says.

**Versions.** The built-in definitions, the message structures included, are those of 2.5.1. They apply when MSH-12
is `2.5`, starts with `2.5.`, or is missing (a missing MSH-12 is itself a required field). For any other version,
`group` still builds the tree, as the best grouping the 2.5.1 structure gives, but reports no segment issues, and
`validate` reports only the structure resolution, one note, `UNSUPPORTED_VERSION`, at MSH-12, and the findings of the
caller's definitions. Segments were added and moved between versions (a 2.7 ADT^A01 may hold UAC and ARV, a 2.8 ORU^R01
PRT), so a 2.5.1 order applied to them would report correct messages. This deviates from the plan's "downgrade to
info": downgrading would give codes such as `REQUIRED_FIELD_MISSING` two severities, against ADR 0004, and findings
from 2.5.1 definitions on a 2.3 or 2.8 message are mostly wrong (fields were renumbered, types changed from CE to CWE
and TS to DTM), so a list of them would be noise, however low its severity.

**Values.**

- The decoded value is checked, as the tree holds it, and is what `Issue.value` carries for validation issues. The
  null `""`, empty values and values the sender truncated are not checked.
- Dates and times must exist (no 30 February); offsets are at most 14 hours, as FHIR accepts. Text lengths (ST, TX,
  FT) are not checked: receivers differ in what they accept, and HL7 itself relaxed them over the versions.
- A table on a coded composite field (a CE field with a table) applies to its first component; a component's own
  table applies otherwise. A composite type in a subcomponent position is checked as its first component, so TS.1
  inside XAD.13 is a DTM. OBX-5 has the type OBX-2 names; a field of an unknown type is not looked into.
- A code missing from an HL7-defined table is `UNKNOWN_CODE` (error); a code missing from a user-defined table is
  `UNKNOWN_USER_DEFINED_CODE` (warning), because sites may extend those tables. Two codes, because a code has one
  severity. A value that fails its format (`MALFORMED_CODE` for an ID or IS) is not also looked up. Codes starting
  with Z in the tables of message codes, trigger events and message structures (0076, 0003, 0354) are not looked up:
  HL7 reserves them for locally defined messages.
- NM accepts `.5` and `5.`: 2.5.1 describes a number as digits with an optional sign and an optional decimal point
  and asks for no digit on either side of the point.
- Content that a definition does not expect is reported with the `UNEXPECTED_*` codes: a field after the last one or
  marked `X` (not used with this trigger event, or not supported), a component or subcomponent a data type does not
  define. `UNDEFINED_Z_SEGMENT` keeps its name, because what is missing there is the definition.

**Caller definitions.** `defineSegment({ id, fields })` numbers the fields by their position in the list and fills
in the defaults (optional, not repeating); the result is a plain `SegmentDefinition`, passed in
`options.segments`, whose type `DefinitionOptions` `validate` and `group` share. Caller definitions apply to every
version and replace a built-in definition with the same identifier, so a site can describe its own profile of a
standard segment. A malformed definition is a mistake in the calling code, so `defineSegment` throws (ADR 0004 keeps
exceptions for programmer errors): a `TypeError` for a missing property or one of the wrong type, a `RangeError` for
an identifier that is not a segment identifier, an empty name, a data type the library does not know, an unknown
optionality, repetitions that are not a whole number of at least 1 or `"unbounded"`, or a table number that is not
four digits. `validate` and `group` never throw, so a definition passed in that was not made with `defineSegment` and
does not have its shape (fields numbered from 1 in order, each with its optionality and repetitions) is ignored and
reported as one `INVALID_DEFINITION` error whose `value` says what is wrong. The message is data, so `validate` and
`group` check its shape first, including a valid span on every node, which their issues point to, and report a tree
from plain JavaScript that is not a message as one `INVALID_TREE` issue instead of throwing.

## Alternatives considered

- **Keeping `group` internal until the mapping needs it.** The mapping of phase 3 needs it, and so do users who map
  their own segments; a shape decided now, with the validation issues it produces, is cheaper than one retrofitted.
- **Copying the segments into the group tree.** Convenient to walk, but it doubles the memory of the largest part of
  a message and gives one segment two identities. An index costs one lookup.
- **A backtracking or regular-expression matcher over the segment identifiers.** It could find a "best" grouping for
  broken messages, but its cost on hostile input is hard to bound, and the issues of a best match are hard to explain.
- **Reporting version-specific findings at a lower severity** (the plan's wording). Rejected for the reasons above.
- **Not checking definitions at runtime.** Definitions are written once, in code, against a typed API, but plain
  JavaScript callers and definitions built from configuration bypass the compiler, and a malformed one would make
  `validate` throw or report nonsense. `defineSegment` throws at the point of the mistake; `validate` and `group`
  report instead, as they promise never to throw.
- **Reporting the segment a match skips as missing even when it comes later** (the first version of the matcher).
  Simple, but `MSH EVN PID OBX PV1` then reports the PV1 that is there as missing and as out of order, which sends the
  reader looking for the wrong segment.
- **Checking formatting escapes against the data type** (ADR 0008 expected typed validation to report `\.br\` in
  fields that are not FT). The tree holds decoded values, so the escapes are no longer visible to `validate`, and
  `parse` already reports each one (`FORMATTING_REMOVED`). Doing it would need the input text as a second argument;
  it is left out until a caller needs it.

## Consequences

- One call answers "is this message valid 2.5.1", with every finding located exactly and coded stably; another gives
  the mapping and the playground the groups. Both take time linear in the message.
- A misplaced segment produces one issue, `SEGMENT_OUT_OF_ORDER` or `SEGMENT_REPEATED`; a required segment is reported
  missing only when it is not in the message after the point where it was due. The greedy matcher does not guess the
  sender's intent beyond that, so which of two swapped segments is reported depends on their order; the tests of
  `group` show such cases.
- Messages of other versions are validated much less strictly. Users who need field rules for them describe the
  segments they care about with `defineSegment`, which applies to every version.
- Adding a rule means a module with its summary and codes, a TSDoc entry for each code in `IssueCode` that says what
  `value` holds, and a run of `pnpm update:validation-rules` to regenerate the page; CI fails if any of the three is
  missing.
