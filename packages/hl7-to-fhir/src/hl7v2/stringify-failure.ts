import type { Location } from "../shared/issue";

/**
 * Why `stringify` cannot write a tree. Trees returned by `parse` are written, except in two cases of malformed input
 * described under `DELIMITERS_MISMATCH` and `HEX_ESCAPE_UNSUPPORTED`; the failures concern trees built or changed by
 * hand.
 *
 * The tree as a whole:
 *
 * - `INVALID_TREE`: the tree does not have the shape of `Hl7Message`: a node is missing, `null`, not an object
 *   or of an unknown `kind`, a list is not an array or has holes, a value or identifier is not a string, or
 *   `truncated` is neither `true` nor absent. Plain JavaScript callers can pass anything; the tree is checked first.
 * - `INVALID_DELIMITERS`: `message.delimiters` cannot be declared in MSH-1 and MSH-2: a delimiter is not a single
 *   printable ASCII character that is neither a letter nor a digit, two are equal, or one is declared although a
 *   delimiter before it in MSH-2 (escape before subcomponent before truncation) is omitted.
 * - `MISSING_MSH`: the message has no segments, or the first one is not `MSH`.
 * - `INVALID_SEGMENT_ID`: a segment identifier contains the field separator or a carriage return, so it would not
 *   read back as one identifier. Other identifiers that `isValidSegmentId` rejects, as `parse` keeps them, are
 *   written as they are.
 *
 * The header (`message.delimiters` is the single source of truth for the delimiters; MSH-1 and MSH-2 are written
 * from it):
 *
 * - `DELIMITERS_MISMATCH`: MSH-1 or MSH-2 holds something other than the declared delimiters, or the written MSH
 *   segment would declare others, for example a truncation character that the version in MSH-12 does not allow.
 *   A tree from `parse` meets it only when the raw MSH-12 starts with an escape sequence (`\H\2.7`) that hides from
 *   the truncation rule a version the written text shows, in a message whose MSH-2 has a fifth character.
 * - `VERSION_MISMATCH`: `message.version` differs from the value of MSH-12.1, from which `parse` reads it.
 *
 * Values the delimiters or the character set cannot express:
 *
 * - `ESCAPE_CHARACTER_REQUIRED`: a value contains a delimiter or a carriage return, or is the text `""`, which need
 *   an escape sequence, but MSH-2 declares no escape character. A line feed is written as it is, except in the first
 *   MSH segment, where it would end the segment.
 * - `HEX_ESCAPE_UNSUPPORTED`: a value contains a carriage return or is the text `""`, which need a hexadecimal escape
 *   sequence, but MSH-18 names a character set in which the library cannot write one: `UNICODE`, `UNICODE UTF-16`,
 *   `UNICODE UTF-32` or a name HL7 table 0211 does not define. Line feeds are written as `\.br\` there, which fails
 *   too when "." is a delimiter, because it would split the sequence. A tree from
 *   `parse` meets it only for a value `""` that the input wrote with formatting commands, such as `"\H\"`, in such a
 *   character set.
 * - `SUBCOMPONENT_SEPARATOR_REQUIRED`: a component has more than one subcomponent, but MSH-2 declares no subcomponent
 *   separator.
 * - `NULL_NOT_REPRESENTABLE`: a subcomponent is the HL7 null, but the quote character is one of the delimiters, so
 *   `""` would not read back as the null.
 * - `TRUNCATION_CHARACTER_REQUIRED`: a value is marked as truncated, but MSH-2 declares no truncation character.
 *
 * The output:
 *
 * - `OUTPUT_TOO_LARGE`: the text would be longer than the longest string the JavaScript engine can hold.
 */
export type StringifyFailureCode =
  | "INVALID_TREE"
  | "INVALID_DELIMITERS"
  | "MISSING_MSH"
  | "INVALID_SEGMENT_ID"
  | "DELIMITERS_MISMATCH"
  | "VERSION_MISMATCH"
  | "ESCAPE_CHARACTER_REQUIRED"
  | "HEX_ESCAPE_UNSUPPORTED"
  | "SUBCOMPONENT_SEPARATOR_REQUIRED"
  | "NULL_NOT_REPRESENTABLE"
  | "TRUNCATION_CHARACTER_REQUIRED"
  | "OUTPUT_TOO_LARGE";

/**
 * The reason `stringify` could not write a message, and the node it is about.
 *
 * @example
 * ```ts
 * import { stringify, type Hl7Message } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 *
 * const result = stringify(message);
 * if (!result.ok) console.error(result.error.code, result.error.location.field);
 * ```
 */
export interface StringifyFailure {
  /** Discriminant: why the tree cannot be written. */
  readonly code: StringifyFailureCode;
  /** A description without message content. */
  readonly message: string;
  /**
   * The node: its position in HL7 numbers (`segmentIndex`, `field`, ...) and the span the tree gives it, or an empty
   * span at 0 when the tree gives none. A failure about the message as a whole has only the span.
   */
  readonly location: Location;
}

// One message per code, like the issue messages; a message never contains message content.
const messages: Readonly<Record<StringifyFailureCode, string>> = {
  INVALID_TREE:
    "The tree does not have the shape of a message: a node is missing or not an object, a list is not an array, or a value is not a string.",
  INVALID_DELIMITERS:
    "The delimiters must be distinct printable ASCII characters that are neither letters nor digits, declared in the order of MSH-2.",
  MISSING_MSH: "The first segment of a message must be MSH.",
  INVALID_SEGMENT_ID:
    "A segment identifier contains the field separator or a carriage return.",
  DELIMITERS_MISMATCH:
    "MSH-1 or MSH-2 disagrees with the delimiters of the message, which are written from the delimiters.",
  VERSION_MISMATCH:
    "The version of the message differs from the value of MSH-12.1.",
  ESCAPE_CHARACTER_REQUIRED:
    'A value contains a delimiter or a line break that cannot be written as it is, or is the text "", which need an escape sequence, but MSH-2 declares no escape character.',
  HEX_ESCAPE_UNSUPPORTED:
    'A value contains a carriage return or is the text "", which need a hexadecimal escape sequence, but the character set of MSH-18 has none the library can write.',
  SUBCOMPONENT_SEPARATOR_REQUIRED:
    "A component has several subcomponents, but MSH-2 declares no subcomponent separator.",
  NULL_NOT_REPRESENTABLE:
    'A subcomponent is the HL7 null, but the quote is one of the delimiters, so "" would not read back as the null.',
  TRUNCATION_CHARACTER_REQUIRED:
    "A value is marked as truncated, but MSH-2 declares no truncation character.",
  OUTPUT_TOO_LARGE:
    "The message text would be longer than the longest string the JavaScript engine supports.",
};

/** Creates the failure of `code` at `location`, with the message of the code. */
export function stringifyFailure(
  code: StringifyFailureCode,
  location: Location,
): StringifyFailure {
  return { code, message: messages[code], location };
}
