import type { Issue, IssueCode, Location, Severity } from "./issue";

/** What every issue of one code has in common. */
interface IssueDefinition {
  readonly severity: Severity;
  /** Says what happened in terms of the standard; never contains message content. */
  readonly message: string;
}

// One entry per code: a code always has the same severity and message, so callers state only what happened and where.
export const issueDefinitions: Readonly<Record<IssueCode, IssueDefinition>> = {
  INVALID_INPUT: {
    severity: "error",
    message:
      'The input is not a string. Decode bytes first, for example with buffer.toString("latin1") for ASCII and ISO-8859-1 messages or buffer.toString("utf8") for UTF-8 ones.',
  },
  INVALID_TREE: {
    severity: "error",
    message:
      "The message does not have the shape of the tree that parse returns: a node is missing, null or of the wrong type, or has no valid span.",
  },
  INVALID_DEFINITION: {
    severity: "error",
    message:
      "A segment definition passed in options does not have the shape that defineSegment returns, so it was ignored; the issue value says what is wrong with it.",
  },
  EMPTY_INPUT: {
    severity: "error",
    message: "The input contains no segments.",
  },
  MISSING_MSH: {
    severity: "error",
    message:
      "The first segment is not MSH. Batch files (FHS, BHS) must be split into messages first.",
  },
  UNEXPECTED_MSH: {
    severity: "warning",
    message:
      "A later MSH segment starts another message; split the input with splitBatch first. The segment is kept in this message.",
  },
  UNEXPECTED_MSH_DELIMITERS: {
    severity: "error",
    message:
      "A later MSH segment starts another message with other delimiters, but its fields were read with the delimiters of the first; split the input with splitBatch first.",
  },
  BYTE_ORDER_MARK_REMOVED: {
    severity: "info",
    message: "A byte order mark before the message was removed.",
  },
  MLLP_FRAMING_REMOVED: {
    severity: "info",
    message: "MLLP framing characters around the message were removed.",
  },
  MLLP_FRAME_UNTERMINATED: {
    severity: "warning",
    message:
      "An MLLP frame has no end block; the message may be cut off, for example by a closed connection.",
  },
  MLLP_FRAME_MALFORMED: {
    severity: "warning",
    message:
      "The MLLP framing is malformed: an end block without start block or without the carriage return after it, text between frames, or several messages in one frame.",
  },
  CONTENT_OUTSIDE_MESSAGE: {
    severity: "warning",
    message:
      "Text outside any message was dropped: segments before the first MSH, after a batch trailer or between MLLP frames.",
  },
  BATCH_COUNT_MISMATCH: {
    severity: "warning",
    message:
      "The count in the batch or file trailer differs from the number of messages or batches in the input.",
  },
  UNEXPECTED_ENVELOPE_SEGMENT: {
    severity: "warning",
    message:
      "A file header (FHS) appears before the trailer (FTS) of the file before it, or a batch header (BHS) before the trailer (BTS) of the batch before it; messages and batches are counted again from it.",
  },
  TRAILING_WHITESPACE_REMOVED: {
    severity: "info",
    message:
      "Whitespace and blank lines after the terminator of the last segment were removed.",
  },
  NON_STANDARD_SEGMENT_TERMINATOR: {
    severity: "info",
    message:
      "Segments end with a line feed or a carriage return and line feed; HL7 v2 uses a carriage return alone.",
  },
  BLANK_LINE_REMOVED: {
    severity: "info",
    message: "An empty line between segments was removed.",
  },
  LINE_FEED_IN_SEGMENT: {
    severity: "info",
    message:
      "A line feed in a message whose segments end with carriage returns is data, not a segment terminator; it stays in its value.",
  },
  INVALID_SEGMENT_ID: {
    severity: "error",
    message:
      "A segment identifier must be three upper-case letters or digits, starting with a letter.",
  },
  INVALID_FIELD_SEPARATOR: {
    severity: "error",
    message:
      "MSH-1, the field separator, is missing or is not a printable ASCII character that is neither a letter nor a digit.",
  },
  INVALID_ENCODING_CHARACTERS: {
    severity: "error",
    message:
      "MSH-2 must hold two to five printable ASCII characters that are neither letters nor digits, all different from each other and from the field separator.",
  },
  ENCODING_CHARACTERS_OMITTED: {
    severity: "info",
    message:
      "MSH-2 omits the subcomponent separator and possibly the escape character; values are not split into subcomponents and, without an escape character, contain no escape sequences.",
  },
  TRUNCATION_CHARACTER_IGNORED: {
    severity: "warning",
    message:
      "MSH-2 declares a truncation character, which only versions 2.7 and later define; it has no special meaning in this message.",
  },
  VALUE_TRUNCATED: {
    severity: "info",
    message:
      "The value ends with the truncation character from MSH-2: the sender cut it off. The character is not part of the value.",
  },
  UNKNOWN_ESCAPE: {
    severity: "warning",
    message: "Unknown escape sequence; it is kept as written.",
  },
  UNTERMINATED_ESCAPE: {
    severity: "warning",
    message:
      "An escape sequence has no closing escape character; the rest of the value is kept as written.",
  },
  FORMATTING_REMOVED: {
    severity: "info",
    message:
      "A text formatting escape sequence was removed; only line breaks have a plain-text equivalent.",
  },
  CHARACTER_SET_ESCAPE_KEPT: {
    severity: "warning",
    message:
      "Character set switching escape sequences are not supported; the sequence is kept as written.",
  },
  LOCAL_ESCAPE_KEPT: {
    severity: "warning",
    message:
      "A locally defined escape sequence cannot be interpreted; it is kept as written.",
  },
  INVALID_HEX_ESCAPE: {
    severity: "warning",
    message:
      "A hexadecimal escape sequence is malformed or encodes bytes that are not valid in the message character set (MSH-18); it is kept as written.",
  },
  UNSUPPORTED_CHARACTER_SET: {
    severity: "warning",
    message:
      "A hexadecimal escape sequence encodes bytes that the library cannot decode in the character set of MSH-18; the sequence is kept as written.",
  },
  NON_STANDARD_CHARACTER_SET: {
    severity: "info",
    message:
      "MSH-18 names the character set with a spelling that HL7 table 0211 does not use; it was recognized anyway.",
  },
  UNSUPPORTED_VERSION: {
    severity: "info",
    message:
      "MSH-12 names a version other than 2.5 or 2.5.x. The segment order and the field, data type and table rules of version 2.5.1 were not applied; only the message structure was resolved and the segment definitions passed in were checked.",
  },
  MESSAGE_STRUCTURE_UNKNOWN: {
    severity: "warning",
    message:
      "MSH-9 identifies no message structure: MSH-9.3 is empty, and MSH-9.1 and MSH-9.2 imply none, as the message is no acknowledgment and HL7 table 0354 assigns no structure to its message code and trigger event. The order of the segments is not checked.",
  },
  MESSAGE_STRUCTURE_MISMATCH: {
    severity: "error",
    message:
      "MSH-9.3 names another message structure than the one that the message code and trigger event in MSH-9.1 and MSH-9.2 imply; the segments are checked against the structure MSH-9.3 names.",
  },
  MESSAGE_STRUCTURE_UNSUPPORTED: {
    severity: "info",
    message:
      "The library has no definition of the message structure that MSH-9 names; the order of the segments is not checked.",
  },
  SEGMENT_MISSING: {
    severity: "error",
    message:
      "A segment that the message structure requires is missing; the location names the segment and points where it belongs.",
  },
  SEGMENT_OUT_OF_ORDER: {
    severity: "error",
    message:
      "The message structure contains the segment, but not at this position: segments that must follow it come before it.",
  },
  SEGMENT_REPEATED: {
    severity: "error",
    message:
      "The segment, or the segment group it starts, occurs more often than the message structure allows at this position.",
  },
  UNEXPECTED_SEGMENT: {
    severity: "warning",
    message:
      "The message structure does not contain the segment, and no definition of it was passed in.",
  },
  UNDEFINED_Z_SEGMENT: {
    severity: "info",
    message:
      "A locally defined Z segment has no definition, so neither its position nor its fields are checked; pass a definition made with defineSegment to validate it.",
  },
  REQUIRED_FIELD_MISSING: {
    severity: "error",
    message:
      'A field that the segment definition requires holds neither a value nor the explicit null "".',
  },
  TOO_MANY_REPETITIONS: {
    severity: "error",
    message:
      "The field repeats more often than its definition allows; the location points at the first repetition too many.",
  },
  UNEXPECTED_FIELD: {
    severity: "warning",
    message:
      "A field after the last one the segment definition has, or one it marks as not used (X), holds a value, often because a value contains an unescaped field separator.",
  },
  UNEXPECTED_COMPONENT: {
    severity: "warning",
    message:
      "A component or subcomponent beyond those its data type defines holds a value, often because a value contains an unescaped delimiter.",
  },
  INVALID_NUMBER: {
    severity: "error",
    message:
      "The value is not a number (NM): an optional + or - sign, digits and at most one decimal point.",
  },
  INVALID_SEQUENCE_ID: {
    severity: "error",
    message:
      "The value is not a sequence ID (SI): a non-negative whole number written with digits only.",
  },
  INVALID_DATE: {
    severity: "error",
    message:
      "The value is not a date (DT) of the form YYYY[MM[DD]], or it names a month or day that does not exist.",
  },
  INVALID_DATE_TIME: {
    severity: "error",
    message:
      "The value is not a date and time (DTM, or the first component of TS) of the form YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ], it names a date or time that does not exist, or its offset exceeds 14 hours.",
  },
  INVALID_TIME: {
    severity: "error",
    message:
      "The value is not a time (TM) of the form HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ], it names a time that does not exist, or its offset exceeds 14 hours.",
  },
  MALFORMED_CODE: {
    severity: "error",
    message:
      "A coded value (ID or IS) has whitespace at its start or end or contains a control character, so it cannot match a table entry.",
  },
  UNKNOWN_CODE: {
    severity: "error",
    message:
      "The code is not in the HL7-defined table that its field or component refers to.",
  },
  UNKNOWN_USER_DEFINED_CODE: {
    severity: "warning",
    message:
      "The code is not in the user-defined table that its field or component refers to, as HL7 suggests it; a site may have added it.",
  },
  HL7_NULL_IGNORED: {
    severity: "info",
    message:
      'An explicit null "" was left out: a transaction bundle cannot express that the receiver should delete the value.',
  },
  UNKNOWN_IDENTIFIER_SYSTEM: {
    severity: "warning",
    message:
      "The assigning authority of an identifier is named but is no ISO OID, UUID or URI and is not in the identifierSystems option, so the identifier has no system.",
  },
  UNMAPPED_CODE: {
    severity: "warning",
    message:
      "The code has no equivalent in the FHIR value set of the element it maps to; the element was left out or holds a generic value.",
  },
  DATE_TIME_PRECISION_ADJUSTED: {
    severity: "info",
    message:
      "The time stops at the hour or minute, which FHIR cannot write; zeros were added for the missing minutes and seconds.",
  },
  DATE_TIME_OFFSET_ASSUMED: {
    severity: "info",
    message:
      "The time has no offset from UTC; the offset of the message time (MSH-7) or of the timezone option was used, which daylight saving time can make differ from the one in effect at the time.",
  },
  DATE_TIME_OFFSET_MISSING: {
    severity: "warning",
    message:
      "The time has no offset from UTC, and neither MSH-7 nor the timezone option gives one, which FHIR requires: the date and time was cut to its date or, for an instant, left out. Set the timezone option.",
  },
  DATE_TIME_TRUNCATED: {
    severity: "info",
    message:
      "The date and time was cut to its date, because the FHIR element holds a date only.",
  },
  DATE_TIME_OMITTED: {
    severity: "warning",
    message:
      "The date and time was left out: the FHIR element is an instant, which needs a time of day, and the value is a date only.",
  },
  TIME_OFFSET_DROPPED: {
    severity: "warning",
    message:
      "The time carries an offset from UTC, which a FHIR time cannot hold; only the time of day was kept.",
  },
  NON_NUMERIC_VALUE: {
    severity: "warning",
    message:
      "A value that FHIR needs as a number is not a number (NM); it was left out.",
  },
  NUMBER_PRECISION_LOST: {
    severity: "warning",
    message:
      "The number has more than 15 significant digits, which a JSON number cannot hold; the nearest number was used.",
  },
  STRUCTURED_NUMERIC_UNSUPPORTED: {
    severity: "warning",
    message:
      "The structured numeric (SN) combines its comparator, numbers and separator in a way FHIR cannot express as a quantity, range or ratio, or is a range from a larger to a smaller number; it was left out.",
  },
  CONTACT_DETAIL_DROPPED: {
    severity: "warning",
    message:
      "The telecommunication number has a part that does not fit its equipment type (XTN.3), an email address with a phone type or phone number parts with an email type; the part was left out.",
  },
  TOO_MANY_ISSUES: {
    severity: "warning",
    message:
      "The input has more than 10,000 issues; only the first 10,000 are reported.",
  },
};

/** An issue of a known code, so that a function returning a subset of codes can say so in its type. */
export type IssueOf<Code extends IssueCode> = Issue & {
  readonly code: Code;
};

/**
 * Creates the issue of `code` at `location`, with the severity and message of its definition.
 *
 * @param value - The raw input text the issue is about, if any; see {@link Issue.value}.
 */
export function issue<Code extends IssueCode>(
  code: Code,
  location: Location,
  value?: string,
): IssueOf<Code> {
  const { severity, message } = issueDefinitions[code];
  return value === undefined
    ? { code, severity, message, location }
    : { code, severity, message, location, value };
}
