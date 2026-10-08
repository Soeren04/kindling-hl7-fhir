/**
 * A range of the original input string, as UTF-16 offsets that can be passed to `String.prototype.slice`.
 *
 * Offsets always refer to the string the caller passed in, including any byte order mark or MLLP framing the parser
 * removed, so `input.slice(span.start, span.end)` returns exactly the text a node or issue refers to.
 *
 * @example
 * ```ts
 * const raw = input.slice(span.start, span.end);
 * ```
 */
export interface Span {
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
export type Severity = "error" | "warning" | "info";

/**
 * Stable identifiers of every issue the library reports.
 *
 * Codes are public API: adding a code is a minor release, renaming or removing one is a major release.
 */
export type IssueCode =
  /** The input contains no text once framing and whitespace are removed. */
  | "EMPTY_INPUT"
  /** The first segment is not `MSH`. */
  | "MISSING_MSH"
  /** A byte order mark at the start of the input was removed. */
  | "BYTE_ORDER_MARK_REMOVED"
  /** An MLLP start block (`0x0B`) or end block (`0x1C`, optionally followed by a carriage return) was removed. */
  | "MLLP_FRAMING_REMOVED"
  /** Whitespace after the last segment was removed. */
  | "TRAILING_WHITESPACE_REMOVED"
  /** Segments end with a line feed or carriage return plus line feed instead of a carriage return. */
  | "NON_STANDARD_SEGMENT_TERMINATOR"
  /** An empty line between segments was removed. */
  | "BLANK_LINE_REMOVED"
  /** A segment identifier is not three upper-case letters or digits starting with a letter; the segment is kept. */
  | "INVALID_SEGMENT_ID"
  /** MSH-1 is missing, or it is not a printable ASCII punctuation character. */
  | "INVALID_FIELD_SEPARATOR"
  /** MSH-2 is empty or longer than five characters, or its delimiters are not distinct punctuation characters. */
  | "INVALID_ENCODING_CHARACTERS"
  /** MSH-2 has fewer than four characters; the missing delimiters take their standard values. */
  | "ENCODING_CHARACTERS_DEFAULTED"
  /** MSH-2 has a fifth character, but the message version is older than 2.7, which introduced it. */
  | "TRUNCATION_CHARACTER_IGNORED"
  /** An escape sequence the standard does not define; it is kept as written. */
  | "UNKNOWN_ESCAPE"
  /** An escape sequence without its closing escape character; the rest of the value is kept as written. */
  | "UNTERMINATED_ESCAPE"
  /** A text formatting escape sequence (highlighting, indentation, centering, ...) was removed. */
  | "FORMATTING_REMOVED"
  /** A character set switching escape sequence (`\C…\`, `\M…\`); it is kept as written. */
  | "CHARACTER_SET_ESCAPE_KEPT"
  /** A locally defined escape sequence (`\Z…\`); it is kept as written. */
  | "LOCAL_ESCAPE_KEPT"
  /** A hexadecimal escape sequence that is malformed or not valid in the message character set; kept as written. */
  | "INVALID_HEX_ESCAPE"
  /** A hexadecimal escape sequence in a message whose character set (MSH-18) is not supported; kept as written. */
  | "UNSUPPORTED_CHARACTER_SET";

/**
 * Where in the input an {@link Issue} was found.
 *
 * `span` is always present. The structural address is present as far as it applies: an issue about the input as a
 * whole (such as removed MLLP framing) has no segment, an issue about a segment has no field, and so on. Field,
 * repetition, component and subcomponent numbers are 1-based, as in HL7 notation (`PID-5[2].1.1`).
 *
 * A location never contains message content: `segmentId` is only set when the segment identifier is valid
 * (three upper-case letters or digits, starting with a letter).
 *
 * @example
 * ```ts
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
export interface Location {
  /** The range of the input the issue refers to. */
  readonly span: Span;
  /** 0-based index of the segment in the message. */
  readonly segmentIndex?: number;
  /** Identifier of the segment, such as `PID`; absent when the identifier is not valid. */
  readonly segmentId?: string;
  /** 1-based field number (`PID-5` is field 5; `MSH-1` is the field separator). */
  readonly field?: number;
  /** 1-based repetition number within the field. */
  readonly repetition?: number;
  /** 1-based component number within the repetition. */
  readonly component?: number;
  /** 1-based subcomponent number within the component. */
  readonly subcomponent?: number;
}

/**
 * A remark about the input: something the library tolerated, normalized or could not interpret.
 *
 * `message` describes the problem in terms of the standard and never contains message content, so issues can be
 * logged safely. The offending raw text is only available in `value`.
 *
 * @example
 * ```ts
 * for (const issue of issues) {
 *   // Safe to log: code, severity, message and location never contain message content.
 *   console.warn(issue.severity, issue.code, issue.message, issue.location?.span);
 * }
 * ```
 */
export interface Issue {
  /** Stable identifier of the kind of issue. */
  readonly code: IssueCode;
  /** How serious the issue is. */
  readonly severity: Severity;
  /** A description of the problem that never contains message content. */
  readonly message: string;
  /** Where the issue was found. */
  readonly location?: Location;
  /**
   * The raw input text the issue is about.
   *
   * This may contain protected health information (PHI). Do not log it unless your logs are allowed to hold
   * patient data.
   */
  readonly value?: string;
}

/** An issue that has a location. Every issue the parser reports has one; the type lets it sort them by position. */
export type LocatedIssue = Issue & { readonly location: Location };
