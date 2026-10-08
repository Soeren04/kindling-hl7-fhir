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
 * Stable identifiers of every issue the library reports.
 *
 * Codes are public API: adding a code is a minor release, renaming or removing one is a major release.
 */
type IssueCode = "INVALID_INPUT" | "EMPTY_INPUT" | "MISSING_MSH" | "UNEXPECTED_MSH" | "UNEXPECTED_MSH_DELIMITERS" | "BYTE_ORDER_MARK_REMOVED" | "MLLP_FRAMING_REMOVED" | "MLLP_FRAME_UNTERMINATED" | "CONTENT_OUTSIDE_MESSAGE" | "BATCH_COUNT_MISMATCH" | "TRAILING_WHITESPACE_REMOVED" | "NON_STANDARD_SEGMENT_TERMINATOR" | "BLANK_LINE_REMOVED" | "LINE_FEED_IN_SEGMENT" | "INVALID_SEGMENT_ID" | "INVALID_FIELD_SEPARATOR" | "INVALID_ENCODING_CHARACTERS" | "ENCODING_CHARACTERS_OMITTED" | "TRUNCATION_CHARACTER_IGNORED" | "VALUE_TRUNCATED" | "UNKNOWN_ESCAPE" | "UNTERMINATED_ESCAPE" | "FORMATTING_REMOVED" | "CHARACTER_SET_ESCAPE_KEPT" | "LOCAL_ESCAPE_KEPT" | "INVALID_HEX_ESCAPE" | "UNSUPPORTED_CHARACTER_SET" | "NON_STANDARD_CHARACTER_SET" | "ESCAPE_CHARACTER_REQUIRED" | "SUBCOMPONENT_SEPARATOR_REQUIRED" | "NULL_NOT_REPRESENTABLE" | "TRUNCATION_CHARACTER_REQUIRED" | "TOO_MANY_ISSUES";
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
  /** Identifier of the segment, such as `PID`; absent when the identifier is not valid. */
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
 * A remark about the input: something the library tolerated, normalized or could not interpret.
 *
 * `message` describes the problem in terms of the standard and never contains message content, so issues can be
 * logged safely. The offending raw text is only available in `value`.
 *
 * @example
 * ```ts
 * import type { Issue } from "hl7-to-fhir";
 *
 * declare const issues: readonly Issue[];
 *
 * for (const issue of issues) {
 *   // Safe to log: code, severity, message and location never contain message content.
 *   console.warn(issue.severity, issue.code, issue.message, issue.location?.span);
 * }
 * ```
 */
interface Issue {
  /** Stable identifier of the kind of issue. */
  readonly code: IssueCode;
  /** How serious the issue is. */
  readonly severity: Severity;
  /** A description of the problem that never contains message content. */
  readonly message: string;
  /** Where the issue was found. */
  readonly location?: Location | undefined;
  /**
   * The raw input text the issue is about.
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