# Validation rules

<!-- Generated from the rule metadata in packages/hl7-to-fhir/src/hl7v2/validate/rules by
`pnpm update:validation-rules`; do not edit it by hand. A test fails when this file differs from the rules. -->

`validate` from `hl7-to-fhir/hl7v2` applies these rules in this order and returns every finding as an issue. Each
code always has the severity and the message listed here; the message never contains message content, and the value
a finding is about is in the issue's `value`, which may contain patient data and should not be logged. `group`
applies the rules up to `segment-order` too. The issues of parsing are documented with `IssueCode`.

## Rules

### `message-shape`

The message has the shape of the tree `parse` returns, with a valid span on every node. A tree built in plain JavaScript with a missing node, a node of the wrong type or a node without a valid span yields this one issue and nothing else.

- Applies to: every message.
- Codes: `INVALID_TREE`.

### `definitions`

Every segment definition passed in `options.segments` has the shape `defineSegment` returns, which `defineSegment` itself ensures by throwing. A definition built another way that does not have it is reported and ignored.

- Applies to: every message.
- Codes: `INVALID_DEFINITION`.

### `message-structure`

MSH-9 identifies the message structure: MSH-9.3 names it, or MSH-9.1 and MSH-9.2 imply it, an acknowledgment (`ACK`) being an ACK and other messages having the structure HL7 table 0354 assigns to their message code and trigger event (ADT^A04 is ADT_A01). When MSH-9.3 contradicts MSH-9.1 and MSH-9.2, the structure MSH-9.3 names is the one checked. The library defines the 2.5.1 structures ADT_A01 and ORU_R01; for others the order of the segments is not checked.

- Applies to: every message.
- Codes: `MESSAGE_STRUCTURE_UNKNOWN`, `MESSAGE_STRUCTURE_MISMATCH`, `MESSAGE_STRUCTURE_UNSUPPORTED`.

### `version`

The built-in message structure, segment, data type and table definitions are those of version 2.5.1 and apply to messages whose MSH-12 is 2.5 or 2.5.x, or is empty (a missing MSH-12 is reported as a required field). For every other version the message structure is resolved and the segments are grouped, but neither their order nor their fields are checked against 2.5.1, because segments, fields, types and tables differ between versions; only the segment definitions passed in are checked.

- Applies to: every message.
- Codes: `UNSUPPORTED_VERSION`.

### `segment-order`

The segments follow the abstract message syntax of the structure: required segments and groups are present, no segment comes before one that must precede it, and none occurs more often than allowed. A segment that is present is never reported as missing: one that would make a required segment that occurs later look missing is reported as out of order instead. A segment the structure does not contain is a warning unless a definition is passed for it; an undefined Z segment is a note. No segment is dropped, whatever the version.

- Applies to: messages of version 2.5 and 2.5.x, and messages without version.
- Codes: `SEGMENT_MISSING`, `SEGMENT_OUT_OF_ORDER`, `SEGMENT_REPEATED`, `UNEXPECTED_SEGMENT`, `UNDEFINED_Z_SEGMENT`.

### `required-fields`

Every field the segment definition marks as required (optionality R) holds a value or the explicit null `""`.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `REQUIRED_FIELD_MISSING`.

### `repetitions`

No field repeats more often than its definition allows; a field that does not repeat has one repetition. Empty repetitions between others count.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `TOO_MANY_REPETITIONS`.

### `unexpected-fields`

No field after the last one the segment definition has, and no field it marks as not used (optionality X), holds anything; such a field is often a sign of a field separator in a value or of a later version of the segment.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `UNEXPECTED_FIELD`.

### `components`

No component or subcomponent beyond those its data type defines holds anything; a primitive type has one of each. Such content is often a delimiter that should have been escaped, or a component a later version added.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `UNEXPECTED_COMPONENT`.

### `formats`

Every value of a type with a format has it: NM numbers, SI sequence IDs, DT dates, DTM date-times (also TS.1), TM times, and ID and IS codes without surrounding whitespace or control characters. Dates and times must exist; offsets are at most 14 hours. OBX-5 is checked as the type OBX-2 names. Text lengths are not checked.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `INVALID_NUMBER`, `INVALID_SEQUENCE_ID`, `INVALID_DATE`, `INVALID_DATE_TIME`, `INVALID_TIME`, `MALFORMED_CODE`.

### `tables`

Every value of a field or component that refers to one of the shipped HL7 tables (0001, 0003, 0004, 0076, 0085, 0104, 0123, 0203, 0354) is a code of that table. A code missing from an HL7-defined table is an error; a site may add codes to a user-defined table, so a code missing there is a warning. Codes starting with Z in the tables of message codes, trigger events and message structures (0076, 0003, 0354) are locally defined messages and are not looked up. A table on a coded composite field, such as a CE, applies to its first component. Values that fail their format are not looked up.

- Applies to: segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always.
- Codes: `UNKNOWN_CODE`, `UNKNOWN_USER_DEFINED_CODE`.

## Codes

| Code                            | Severity | Rule                | Message                                                                                                                                                                                                                                                   |
| ------------------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_TREE`                  | error    | `message-shape`     | The message does not have the shape of the tree that parse returns: a node is missing, null or of the wrong type, or has no valid span.                                                                                                                   |
| `INVALID_DEFINITION`            | error    | `definitions`       | A segment definition passed in options does not have the shape that defineSegment returns, so it was ignored; the issue value says what is wrong with it.                                                                                                 |
| `MESSAGE_STRUCTURE_UNKNOWN`     | warning  | `message-structure` | MSH-9 identifies no message structure: MSH-9.3 is empty, and MSH-9.1 and MSH-9.2 imply none, as the message is no acknowledgment and HL7 table 0354 assigns no structure to its message code and trigger event. The order of the segments is not checked. |
| `MESSAGE_STRUCTURE_MISMATCH`    | error    | `message-structure` | MSH-9.3 names another message structure than the one that the message code and trigger event in MSH-9.1 and MSH-9.2 imply; the segments are checked against the structure MSH-9.3 names.                                                                  |
| `MESSAGE_STRUCTURE_UNSUPPORTED` | info     | `message-structure` | The library has no definition of the message structure that MSH-9 names; the order of the segments is not checked.                                                                                                                                        |
| `UNSUPPORTED_VERSION`           | info     | `version`           | MSH-12 names a version other than 2.5 or 2.5.x. The segment order and the field, data type and table rules of version 2.5.1 were not applied; only the message structure was resolved and the segment definitions passed in were checked.                 |
| `SEGMENT_MISSING`               | error    | `segment-order`     | A segment that the message structure requires is missing; the location names the segment and points where it belongs.                                                                                                                                     |
| `SEGMENT_OUT_OF_ORDER`          | error    | `segment-order`     | The message structure contains the segment, but not at this position: segments that must follow it come before it.                                                                                                                                        |
| `SEGMENT_REPEATED`              | error    | `segment-order`     | The segment, or the segment group it starts, occurs more often than the message structure allows at this position.                                                                                                                                        |
| `UNEXPECTED_SEGMENT`            | warning  | `segment-order`     | The message structure does not contain the segment, and no definition of it was passed in.                                                                                                                                                                |
| `UNDEFINED_Z_SEGMENT`           | info     | `segment-order`     | A locally defined Z segment has no definition, so neither its position nor its fields are checked; pass a definition made with defineSegment to validate it.                                                                                              |
| `REQUIRED_FIELD_MISSING`        | error    | `required-fields`   | A field that the segment definition requires holds neither a value nor the explicit null "".                                                                                                                                                              |
| `TOO_MANY_REPETITIONS`          | error    | `repetitions`       | The field repeats more often than its definition allows; the location points at the first repetition too many.                                                                                                                                            |
| `UNEXPECTED_FIELD`              | warning  | `unexpected-fields` | A field after the last one the segment definition has, or one it marks as not used (X), holds a value, often because a value contains an unescaped field separator.                                                                                       |
| `UNEXPECTED_COMPONENT`          | warning  | `components`        | A component or subcomponent beyond those its data type defines holds a value, often because a value contains an unescaped delimiter.                                                                                                                      |
| `INVALID_NUMBER`                | error    | `formats`           | The value is not a number (NM): an optional + or - sign, digits and at most one decimal point.                                                                                                                                                            |
| `INVALID_SEQUENCE_ID`           | error    | `formats`           | The value is not a sequence ID (SI): a non-negative whole number written with digits only.                                                                                                                                                                |
| `INVALID_DATE`                  | error    | `formats`           | The value is not a date (DT) of the form YYYY[MM[DD]], or it names a month or day that does not exist.                                                                                                                                                    |
| `INVALID_DATE_TIME`             | error    | `formats`           | The value is not a date and time (DTM, or the first component of TS) of the form YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ], it names a date or time that does not exist, or its offset exceeds 14 hours.                                             |
| `INVALID_TIME`                  | error    | `formats`           | The value is not a time (TM) of the form HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ], it names a time that does not exist, or its offset exceeds 14 hours.                                                                                                           |
| `MALFORMED_CODE`                | error    | `formats`           | A coded value (ID or IS) has whitespace at its start or end or contains a control character, so it cannot match a table entry.                                                                                                                            |
| `UNKNOWN_CODE`                  | error    | `tables`            | The code is not in the HL7-defined table that its field or component refers to.                                                                                                                                                                           |
| `UNKNOWN_USER_DEFINED_CODE`     | warning  | `tables`            | The code is not in the user-defined table that its field or component refers to, as HL7 suggests it; a site may have added it.                                                                                                                            |
