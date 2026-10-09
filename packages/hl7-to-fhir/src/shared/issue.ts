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
  /** The input is not a string, for example a `Buffer` that was not decoded or `undefined`. */
  | "INVALID_INPUT"
  /** The input contains no text once framing and whitespace are removed. */
  | "EMPTY_INPUT"
  /** The first segment is not `MSH`. */
  | "MISSING_MSH"
  /** A byte order mark at the start of the input was removed. */
  | "BYTE_ORDER_MARK_REMOVED"
  /** An MLLP start block (`0x0B`) or end block (`0x1C`, optionally followed by a carriage return) was removed. */
  | "MLLP_FRAMING_REMOVED"
  /** An MLLP start block (`0x0B`) has no matching end block; the message runs to the next start block or the end of the input. */
  | "MLLP_FRAME_UNTERMINATED"
  /** Text outside any message (before the first `MSH`, between batches or between MLLP frames) was dropped. */
  | "CONTENT_OUTSIDE_MESSAGE"
  /** A trailer count differs from what the input contains: `BTS-1` counts messages, `FTS-1` counts batches. */
  | "BATCH_COUNT_MISMATCH"
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
  | "UNSUPPORTED_CHARACTER_SET"
  /** More issues were found than are reported (10,000); this issue, at the end of the input, replaces the rest. */
  | "TOO_MANY_ISSUES";

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

/**
 * An issue whose `location` is present. Every issue the library creates has one; the type lets the parser and the
 * batch splitter sort issues by position without checking for an absent location.
 */
export type LocatedIssue = Issue & { readonly location: Location };

/** What every issue of one code has in common. */
interface IssueDefinition {
  readonly severity: Severity;
  /** Describes the problem in terms of the standard; never contains message content. */
  readonly message: string;
}

// One entry per code: a code always has the same severity and message, so callers state only what happened and where.
const definitions: Readonly<Record<IssueCode, IssueDefinition>> = {
  INVALID_INPUT: {
    severity: "error",
    message:
      'The input is not a string. Decode bytes first, for example with buffer.toString("latin1") for ASCII and ISO-8859-1 messages or buffer.toString("utf8") for UTF-8 ones.',
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
  TRAILING_WHITESPACE_REMOVED: {
    severity: "info",
    message: "Whitespace after the last segment was removed.",
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
      "MSH-2 must hold one to five printable ASCII characters that are neither letters nor digits, all different from each other, from the field separator and from the standard values of omitted ones.",
  },
  ENCODING_CHARACTERS_DEFAULTED: {
    severity: "warning",
    message:
      "MSH-2 declares fewer than four encoding characters; the omitted ones take their standard values.",
  },
  TRUNCATION_CHARACTER_IGNORED: {
    severity: "warning",
    message:
      "MSH-2 declares a truncation character, which only versions 2.7 and later define; it has no special meaning in this message.",
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
      "The character set in MSH-18 is not supported for hexadecimal escape sequences; the sequence is kept as written.",
  },
  TOO_MANY_ISSUES: {
    severity: "warning",
    message:
      "The input has more than 10,000 issues; only the first 10,000 are reported.",
  },
};

/**
 * The most issues one call reports. Hostile input can hold an issue every few characters; the limit keeps the issue
 * list from growing with the input while leaving far more than anyone reads.
 */
export const maxIssues = 10_000;

/** An issue of a known code, so that a function returning a subset of codes can say so in its type. */
export type IssueOf<Code extends IssueCode> = LocatedIssue & {
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
  const { severity, message } = definitions[code];
  return value === undefined
    ? { code, severity, message, location }
    : { code, severity, message, location, value };
}

/**
 * Creates the issue of `code` (see {@link issue}) and adds it to `issues`, unless the list is full: it keeps at most
 * one issue more than {@link maxIssues}, which tells {@link finishIssues} that issues were dropped.
 */
export function report(
  issues: LocatedIssue[],
  code: IssueCode,
  location: Location,
  value?: string,
): void {
  if (issues.length <= maxIssues) issues.push(issue(code, location, value));
}

/**
 * Whether `value` is a string. Callers in plain JavaScript can pass anything, so the public functions check their
 * text arguments and fail with `INVALID_INPUT` instead of throwing a `TypeError` deep inside.
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Turns the collected issues into the reported list: sorted by their position in the input (issues at the same
 * position keep the order they were found in) and, when issues were dropped, cut to {@link maxIssues} and ended by
 * one `TOO_MANY_ISSUES` warning located at the end of the input.
 *
 * @param inputLength - The length of the input, where `TOO_MANY_ISSUES` is located.
 */
export function finishIssues(
  issues: readonly LocatedIssue[],
  inputLength: number,
): LocatedIssue[] {
  const sorted = issues
    .slice()
    .sort((a, b) => a.location.span.start - b.location.span.start);
  if (sorted.length <= maxIssues) return sorted;
  const end = { start: inputLength, end: inputLength };
  return sorted
    .slice(0, maxIssues)
    .concat(issue("TOO_MANY_ISSUES", { span: end }));
}
