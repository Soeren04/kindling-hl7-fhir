//#region src/shared/issue.d.ts
/**
 * A range of the original input string, as UTF-16 offsets that can be passed to `String.prototype.slice`.
 *
 * Offsets always refer to the string the caller passed in, including any byte order mark or MLLP framing the parser
 * removed, so `input.slice(span.start, span.end)` returns exactly the text a node or issue refers to.
 *
 * @example
 * ```ts
 * import type { Span } from "hl7-to-fhir";
 *
 * declare const input: string;
 * declare const span: Span;
 *
 * const raw = input.slice(span.start, span.end);
 * ```
 */
interface Span {
  /** Offset of the first character. */
  readonly start: number;
  /** Offset after the last character (exclusive); equal to `start` for an empty range. */
  readonly end: number;
}
/**
 * How serious an {@link Issue} is.
 *
 * - `error`: the input violates the standard in a way that likely changes its meaning.
 * - `warning`: the input deviates from the standard; the result is usable but may not be what the sender meant.
 * - `info`: the input was normalized in a way that does not change its meaning (for example, framing removed).
 */
type Severity = "error" | "warning" | "info";
/**
 * Stable identifiers of every issue the library reports. Each code always has the severity listed here, and each
 * entry says what {@link Issue.value} holds for it.
 *
 * Input and message structure:
 *
 * - `INVALID_INPUT` (error): the input is not a string, for example a `Buffer` that was not decoded or `undefined`.
 *   No `value`.
 * - `INVALID_TREE` (error): a message passed to `validate` or `group` does not have the shape of the tree `parse`
 *   returns: a node is missing, `null` or of the wrong type, or has no valid span. Possible only for trees built in
 *   plain JavaScript. No `value`.
 * - `INVALID_DEFINITION` (error): a segment definition passed to `validate` or `group` was not made with
 *   `defineSegment` and does not have its shape; it is ignored. `value` says what is wrong with it.
 * - `EMPTY_INPUT` (error): the input contains no text once framing and whitespace are removed. No `value`.
 * - `MISSING_MSH` (error): the first segment is not `MSH`. No `value`.
 * - `UNEXPECTED_MSH` (warning): a later segment is MSH, so the input holds more than one message and should be split
 *   with `splitBatch` first. No `value`.
 * - `UNEXPECTED_MSH_DELIMITERS` (error): like `UNEXPECTED_MSH`, but the later MSH declares other delimiters while its
 *   fields are read with the first's. No `value`.
 * - `INVALID_SEGMENT_ID` (error): a segment identifier is not three upper-case letters or digits starting with a
 *   letter; the segment is kept. `value` is the identifier.
 * - `INVALID_FIELD_SEPARATOR` (error): MSH-1 is missing, or it is not a printable ASCII punctuation character.
 *   `value` is the character, when there is one.
 * - `INVALID_ENCODING_CHARACTERS` (error): MSH-2 has fewer than two or more than five characters, or its delimiters
 *   are not distinct punctuation characters. `value` is MSH-2.
 * - `ENCODING_CHARACTERS_OMITTED` (info): MSH-2 omits the subcomponent separator and possibly the escape character;
 *   the message does not use them. `value` is MSH-2.
 * - `TRUNCATION_CHARACTER_IGNORED` (warning): MSH-2 has a fifth character, but the message version is older than 2.7,
 *   which introduced it. `value` is that character.
 * - `VALUE_TRUNCATED` (info): a value ends with the truncation character (version 2.7 and later): the sender cut it
 *   off. `value` is the truncation character.
 *
 * Framing and whitespace:
 *
 * - `BYTE_ORDER_MARK_REMOVED` (info): a byte order mark at the start of the input was removed. No `value`.
 * - `MLLP_FRAMING_REMOVED` (info): an MLLP start block (`0x0B`) or end block (`0x1C`, optionally followed by a
 *   carriage return) was removed. No `value`.
 * - `MLLP_FRAME_UNTERMINATED` (warning): an MLLP start block has no matching end block; the message runs to the next
 *   start block or the end of the input. No `value`.
 * - `MLLP_FRAME_MALFORMED` (warning): MLLP framing that does not follow the protocol: an end block without start
 *   block or not followed by a carriage return, text between frames, or several messages in one frame. The messages
 *   are split anyway. No `value`.
 * - `CONTENT_OUTSIDE_MESSAGE` (warning): text outside any message (before the first `MSH`, between batches or between
 *   MLLP frames) was dropped. `value` is the dropped text.
 * - `BATCH_COUNT_MISMATCH` (warning): a trailer count differs from what the input contains: `BTS-1` counts messages,
 *   `FTS-1` counts batches. No `value`.
 * - `UNEXPECTED_ENVELOPE_SEGMENT` (warning): an `FHS` inside a file without `FTS`, or a `BHS` inside a batch without
 *   `BTS`; counting starts again from it. No `value`.
 * - `TRAILING_WHITESPACE_REMOVED` (info): whitespace and blank lines after the terminator of the last segment were
 *   removed. Spaces and tabs at the end of the last segment itself are part of its last value and stay. No `value`.
 * - `NON_STANDARD_SEGMENT_TERMINATOR` (info): segments end with a line feed or a carriage return plus line feed
 *   instead of a carriage return. No `value`.
 * - `BLANK_LINE_REMOVED` (info): an empty line between segments was removed. No `value`.
 * - `LINE_FEED_IN_SEGMENT` (info): a line feed inside a message whose MSH segment ends with a carriage return is data,
 *   not a segment terminator; it stays in its value. No `value`.
 *
 * Escape sequences and character sets (`value` is the escape sequence as written, unless stated otherwise):
 *
 * - `UNKNOWN_ESCAPE` (warning): an escape sequence the standard does not define; it is kept as written.
 * - `UNTERMINATED_ESCAPE` (warning): an escape sequence without its closing escape character; the rest of the value
 *   is kept as written. `value` runs from the escape character to the end of the value.
 * - `FORMATTING_REMOVED` (info): a text formatting escape sequence (highlighting, indentation, centering, ...) was
 *   removed.
 * - `CHARACTER_SET_ESCAPE_KEPT` (warning): a character set switching escape sequence (`\C...\`, `\M...\`); it is kept
 *   as written.
 * - `LOCAL_ESCAPE_KEPT` (warning): a locally defined escape sequence (`\Z...\`); it is kept as written.
 * - `INVALID_HEX_ESCAPE` (warning): a hexadecimal escape sequence that is malformed or not valid in the message
 *   character set; it is kept as written.
 * - `UNSUPPORTED_CHARACTER_SET` (warning): a hexadecimal escape sequence in a character set (MSH-18) the library
 *   cannot decode; it is kept as written.
 * - `NON_STANDARD_CHARACTER_SET` (info): MSH-18 names a character set with a spelling HL7 table 0211 does not use,
 *   such as `UTF-8`; it is recognized. `value` is MSH-18.
 *
 * Message version and structure (validation):
 *
 * - `UNSUPPORTED_VERSION` (info): MSH-12 names a version other than 2.5 and 2.5.x; the segment order and the field,
 *   data type and table rules of version 2.5.1 are not applied, only the structure resolution and the segment
 *   definitions passed in. `value` is MSH-12.
 * - `MESSAGE_STRUCTURE_UNKNOWN` (warning): MSH-9 identifies no message structure: MSH-9.3 is empty, and MSH-9.1 and
 *   MSH-9.2 imply none; segment order is not checked. No `value`.
 * - `MESSAGE_STRUCTURE_MISMATCH` (error): MSH-9.3 names another structure than the one MSH-9.1 and MSH-9.2 imply
 *   (`ADT^A04^ORU_R01`); the segments are checked against the one MSH-9.3 names. `value` is MSH-9.3.
 * - `MESSAGE_STRUCTURE_UNSUPPORTED` (info): the library has no definition of the message structure; segment order is
 *   not checked. `value` is the structure, such as `ORM_O01`.
 * - `SEGMENT_MISSING` (error): a segment the message structure requires is missing; the location names it
 *   (`segmentId`) and has an empty span where it belongs, but no `segmentIndex`. No `value`.
 * - `SEGMENT_OUT_OF_ORDER` (error): the message structure contains the segment, but not at this position: segments
 *   that must follow it come before it. No `value`.
 * - `SEGMENT_REPEATED` (error): the segment, or the group it starts, occurs more often than the message structure
 *   allows at this position. No `value`.
 * - `UNEXPECTED_SEGMENT` (warning): the message structure does not contain the segment, and no definition of it was
 *   passed in. No `value`.
 * - `UNDEFINED_Z_SEGMENT` (info): a locally defined Z segment without a definition; it is kept, but neither its
 *   position nor its fields are checked. No `value`.
 *
 * Fields (validation):
 *
 * - `REQUIRED_FIELD_MISSING` (error): a field the segment definition requires holds neither a value nor `""`. No
 *   `value`.
 * - `TOO_MANY_REPETITIONS` (error): a field repeats more often than its definition allows; the location is the first
 *   repetition too many. No `value`.
 * - `UNEXPECTED_FIELD` (warning): a field after the last one the segment definition has, or one it marks as not used
 *   (`X`), holds something. No `value`.
 * - `UNEXPECTED_COMPONENT` (warning): a component or subcomponent beyond those its data type defines holds something;
 *   a primitive type has one of each. No `value`.
 *
 * Values (validation and mapping; `value` is the decoded value, as the message tree holds it):
 *
 * - `INVALID_NUMBER` (error): a value of type NM is not an optional sign, digits and at most one decimal point.
 * - `INVALID_SEQUENCE_ID` (error): a value of type SI is not a non-negative whole number.
 * - `INVALID_DATE` (error): a value of type DT is not `YYYY[MM[DD]]` or names a day that does not exist.
 * - `INVALID_DATE_TIME` (error): a value of type DTM, or the first component of a TS, is not
 *   `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`, names a date or time that does not exist, or has an offset of
 *   more than 14 hours.
 * - `INVALID_TIME` (error): a value of type TM is not `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]` or names a time that does
 *   not exist.
 * - `MALFORMED_CODE` (error): a coded value (ID or IS) has whitespace at either end or a control character.
 * - `UNKNOWN_CODE` (error): a coded value is not in the HL7-defined table its field or component refers to.
 * - `UNKNOWN_USER_DEFINED_CODE` (warning): a coded value is not in the user-defined table its field or component refers
 *   to, as HL7 suggests it; sites may add codes to such tables.
 *
 * Mapping to FHIR (`value` is the decoded value the issue is about, unless stated otherwise):
 *
 * - `HL7_NULL_IGNORED` (info): an explicit null `""` was left out of a transaction bundle, which has no way to say
 *   "delete this value"; reported only for transaction bundles. No `value`.
 * - `DATE_TIME_PRECISION_ADJUSTED` (info): a date and time or a time stops at the hour or minute, which FHIR cannot
 *   write; zeros were added for the missing minutes and seconds.
 * - `DATE_TIME_OFFSET_ASSUMED` (info): a date and time has a time of day but no offset from UTC, so the offset of the
 *   message time (MSH-7) or of the `timezone` option was used. Daylight saving time can make it differ from the offset
 *   in effect at the time of the value.
 * - `DATE_TIME_OFFSET_MISSING` (warning): a date and time has a time of day but no offset can be found, neither in the
 *   value nor in MSH-7 nor in the `timezone` option, and FHIR requires one: a date and time was cut to its date, an
 *   instant was left out. Setting the `timezone` option avoids it.
 * - `DATE_TIME_TRUNCATED` (info): a date and time was cut to its date, because the FHIR element holds a date only.
 * - `DATE_TIME_OMITTED` (warning): a date and time was left out, because the FHIR element is an instant, which needs a
 *   time of day, and the value is a date only.
 * - `TIME_OFFSET_DROPPED` (warning): a time carries an offset, which a FHIR time cannot hold; the time of day is kept.
 * - `NON_NUMERIC_VALUE` (warning): a value that FHIR needs as a number is not a number (NM); it was left out.
 * - `NUMBER_PRECISION_LOST` (warning): a number has more than 15 significant digits, which a JSON number cannot hold;
 *   the nearest number was used.
 * - `STRUCTURED_NUMERIC_UNSUPPORTED` (warning): a structured numeric (SN) combines its comparator, numbers and separator
 *   in a way FHIR cannot express as a quantity, range or ratio, or it is a range from a larger to a smaller number; it
 *   was left out. `value` is the comparator or separator that cannot be expressed, absent when a number is missing or
 *   the range is inverted.
 *
 * Limits:
 *
 * - `TOO_MANY_ISSUES` (warning): more issues were found than are reported (10,000); this issue, at the end of the
 *   input, replaces the rest. No `value`.
 *
 * Codes are public API: adding a code is a minor release, renaming or removing one is a major release.
 */
type IssueCode =
  | "INVALID_INPUT"
  | "INVALID_TREE"
  | "INVALID_DEFINITION"
  | "EMPTY_INPUT"
  | "MISSING_MSH"
  | "UNEXPECTED_MSH"
  | "UNEXPECTED_MSH_DELIMITERS"
  | "BYTE_ORDER_MARK_REMOVED"
  | "MLLP_FRAMING_REMOVED"
  | "MLLP_FRAME_UNTERMINATED"
  | "MLLP_FRAME_MALFORMED"
  | "CONTENT_OUTSIDE_MESSAGE"
  | "BATCH_COUNT_MISMATCH"
  | "UNEXPECTED_ENVELOPE_SEGMENT"
  | "TRAILING_WHITESPACE_REMOVED"
  | "NON_STANDARD_SEGMENT_TERMINATOR"
  | "BLANK_LINE_REMOVED"
  | "LINE_FEED_IN_SEGMENT"
  | "INVALID_SEGMENT_ID"
  | "INVALID_FIELD_SEPARATOR"
  | "INVALID_ENCODING_CHARACTERS"
  | "ENCODING_CHARACTERS_OMITTED"
  | "TRUNCATION_CHARACTER_IGNORED"
  | "VALUE_TRUNCATED"
  | "UNKNOWN_ESCAPE"
  | "UNTERMINATED_ESCAPE"
  | "FORMATTING_REMOVED"
  | "CHARACTER_SET_ESCAPE_KEPT"
  | "LOCAL_ESCAPE_KEPT"
  | "INVALID_HEX_ESCAPE"
  | "UNSUPPORTED_CHARACTER_SET"
  | "NON_STANDARD_CHARACTER_SET"
  | "UNSUPPORTED_VERSION"
  | "MESSAGE_STRUCTURE_UNKNOWN"
  | "MESSAGE_STRUCTURE_MISMATCH"
  | "MESSAGE_STRUCTURE_UNSUPPORTED"
  | "SEGMENT_MISSING"
  | "SEGMENT_OUT_OF_ORDER"
  | "SEGMENT_REPEATED"
  | "UNEXPECTED_SEGMENT"
  | "UNDEFINED_Z_SEGMENT"
  | "REQUIRED_FIELD_MISSING"
  | "TOO_MANY_REPETITIONS"
  | "UNEXPECTED_FIELD"
  | "UNEXPECTED_COMPONENT"
  | "INVALID_NUMBER"
  | "INVALID_SEQUENCE_ID"
  | "INVALID_DATE"
  | "INVALID_DATE_TIME"
  | "INVALID_TIME"
  | "MALFORMED_CODE"
  | "UNKNOWN_CODE"
  | "UNKNOWN_USER_DEFINED_CODE"
  | "HL7_NULL_IGNORED"
  | "DATE_TIME_PRECISION_ADJUSTED"
  | "DATE_TIME_OFFSET_ASSUMED"
  | "DATE_TIME_OFFSET_MISSING"
  | "DATE_TIME_TRUNCATED"
  | "DATE_TIME_OMITTED"
  | "TIME_OFFSET_DROPPED"
  | "NON_NUMERIC_VALUE"
  | "NUMBER_PRECISION_LOST"
  | "STRUCTURED_NUMERIC_UNSUPPORTED"
  | "TOO_MANY_ISSUES";
/**
 * Where in the input an {@link Issue}, or in a tree a stringify failure, was found.
 *
 * `span` is always present. The structural address is present as far as it applies: an issue about the input as a
 * whole (such as removed MLLP framing) has no segment, an issue about a segment has no field, and so on.
 *
 * Numbering follows one rule across the library: a `*Index` is a 0-based index into an array (`segmentIndex` is the
 * position in `message.segments`), and every other position is the 1-based number that HL7 notation uses
 * (`PID-5[2].1.1` is `field: 5`, `repetition: 2`, `component: 1`, `subcomponent: 1`). `MSH-1` is the field separator.
 *
 * A location never contains message content: `segmentId` is only set when the segment identifier is valid
 * (three upper-case letters or digits, starting with a letter).
 *
 * Something that is missing has no node to point at: a missing segment has the identifier the message structure
 * expects in `segmentId`, no `segmentIndex`, and an empty span where it belongs; a missing field has its number and,
 * when the segment ends before it, an empty span at the end of the segment.
 *
 * @example
 * ```ts
 * import type { Location } from "hl7-to-fhir";
 *
 * // PID-5, second repetition, first component: "PID-5[2].1"
 * const location: Location = {
 *   span: { start: 120, end: 128 },
 *   segmentIndex: 2,
 *   segmentId: "PID",
 *   field: 5,
 *   repetition: 2,
 *   component: 1,
 * };
 * ```
 */
interface Location {
  /** The range of the input the issue refers to. */
  readonly span: Span;
  /** 0-based index of the segment in the message. */
  readonly segmentIndex?: number | undefined;
  /**
   * Identifier of the segment, such as `PID`; absent when the identifier is not valid. For a missing segment, the
   * identifier the message structure expects.
   */
  readonly segmentId?: string | undefined;
  /** 1-based field number (`PID-5` is field 5; `MSH-1` is the field separator). */
  readonly field?: number | undefined;
  /** 1-based repetition number within the field. */
  readonly repetition?: number | undefined;
  /** 1-based component number within the repetition. */
  readonly component?: number | undefined;
  /** 1-based subcomponent number within the component. */
  readonly subcomponent?: number | undefined;
}
/**
 * Something the library noticed in the input and tolerated, normalized or could not interpret.
 *
 * `message` describes what happened in terms of the standard and never contains message content, so issues can be
 * logged safely. The raw text the issue is about is only available in `value`.
 *
 * @example
 * ```ts
 * import type { Issue } from "hl7-to-fhir";
 *
 * declare const issues: readonly Issue[];
 *
 * for (const issue of issues) {
 *   // Safe to log: code, severity, message and location never contain message content.
 *   console.warn(issue.severity, issue.code, issue.message, issue.location.span);
 * }
 * ```
 */
interface Issue {
  /** Stable identifier of the kind of issue. */
  readonly code: IssueCode;
  /** How serious the issue is. */
  readonly severity: Severity;
  /** A description of what happened that never contains message content. */
  readonly message: string;
  /** Where the issue was found; an issue about the input as a whole has only a span. */
  readonly location: Location;
  /**
   * The input text the issue is about, when there is one: the raw text for issues of parsing, the decoded value (as
   * the message tree holds it) for issues of validation. The entry of each code in {@link IssueCode} says what it
   * holds.
   *
   * This may contain protected health information (PHI). Do not log it unless your logs are allowed to hold
   * patient data.
   */
  readonly value?: string | undefined;
}
//#endregion
//#region src/shared/result.d.ts
/**
 * The successful outcome of an operation that can fail in an expected way.
 *
 * @typeParam T - The type of the produced value.
 */
interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
/**
 * The failed outcome of an operation that can fail in an expected way.
 *
 * @typeParam E - The type describing why the operation failed.
 */
interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
/**
 * The outcome of an operation that can fail in an expected way: either {@link Ok} or {@link Err}.
 *
 * Expected failures are returned instead of thrown, so callers see them in the type and handle them by
 * checking the `ok` discriminant.
 *
 * @typeParam T - The type of the produced value.
 * @typeParam E - The type describing why the operation failed.
 *
 * @example
 * ```ts
 * import type { Result } from "hl7-to-fhir";
 *
 * declare const result: Result<number, "EMPTY">;
 * if (result.ok) console.log(result.value + 1);
 * else console.error(result.error);
 * ```
 */
type Result<T, E> = Ok<T> | Err<E>;
//#endregion
export { IssueCode as a, Span as c, Issue as i, Ok as n, Location as o, Result as r, Severity as s, Err as t };