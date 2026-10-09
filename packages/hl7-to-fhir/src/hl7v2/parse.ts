import { type Issue } from "../shared/issue";
import { issue, type IssueOf } from "../shared/issue-table";
import { finishIssues } from "../shared/collect";
import { isString } from "../shared/guards";
import { err, ok, type Result } from "../shared/result";
import { readDelimiters } from "./delimiters";
import { checkLaterHeader, headerSegmentId, readCharset } from "./header";
import { locateContent, splitLines } from "./input";
import type { Hl7Message } from "./model";
import { parseSegment } from "./segment";
import { versionOf } from "./version";

/**
 * What {@link parse} returns when it succeeds, the counterpart of {@link ParseFailure}: the message and everything the
 * parser tolerated or could not interpret.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * declare const input: string;
 *
 * const result = parse(input);
 * if (result.ok) {
 *   const { message, issues } = result.value;
 *   console.log(message.segments.length, issues.length);
 * }
 * ```
 */
export interface ParseSuccess {
  /** The message tree. */
  readonly message: Hl7Message;
  /** The issues in input order; parsing succeeded regardless of their severity. */
  readonly issues: readonly Issue[];
}

/**
 * Why the input could not be read as an HL7 v2 message at all.
 *
 * - `INVALID_INPUT`: the input is not a string (for example an undecoded `Buffer`).
 * - `EMPTY_INPUT`: there is no text once framing and whitespace are removed.
 * - `MISSING_MSH`: the first segment is not `MSH`.
 * - `INVALID_FIELD_SEPARATOR`: MSH-1 is missing or not a printable ASCII punctuation character.
 * - `INVALID_ENCODING_CHARACTERS`: MSH-2 has fewer than two or more than five characters, or the delimiters are not
 *   distinct punctuation characters.
 */
export type ParseFailureCode =
  | "INVALID_INPUT"
  | "EMPTY_INPUT"
  | "MISSING_MSH"
  | "INVALID_FIELD_SEPARATOR"
  | "INVALID_ENCODING_CHARACTERS";

/**
 * The reason {@link parse} failed, with the issues found up to that point.
 *
 * `issues` always ends with an `error` issue whose `code` equals the failure `code` and whose location points at the
 * offending input, so editors can underline it.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("PID|1");
 * if (!result.ok) console.error(result.error.code); // => "MISSING_MSH"
 * ```
 */
export interface ParseFailure {
  /** Discriminant: why parsing failed. */
  readonly code: ParseFailureCode;
  /** A description without message content. */
  readonly message: string;
  /** The issues found before parsing stopped, ending with the one that stopped it. */
  readonly issues: readonly Issue[];
}

/**
 * Parses an HL7 v2 message.
 *
 * Parsing is lenient: segments may end with `\r`, `\n` or `\r\n` (when MSH ends with `\r` or `\r\n`, a
 * line feed on its own is data and stays in its value); a byte order mark, MLLP framing and whitespace after the last
 * segment are removed; unknown, Z and malformed segments are kept in order. Each deviation is reported in
 * `issues`. Parsing fails only when the input is not a string, has no `MSH` segment first or
 * declares unusable delimiters; it never throws.
 *
 * Every node carries a span into `input`, the string passed in, even when framing was removed. Read values with
 * `get` and `getAll` in HL7 notation (`PID.5.1`), or walk the tree, where `fields[n - 1]` is field `n`.
 * The types of the issues are exported from the main entry point, `hl7-to-fhir`.
 *
 * A later MSH segment starts a second message; `parse` keeps it as a segment and reports it (`UNEXPECTED_MSH`, or the
 * error `UNEXPECTED_MSH_DELIMITERS` when it declares other delimiters than the first).
 *
 * Memory: the returned tree keeps one object per field, repetition, component and subcomponent, each with its own
 * span. That is about 110 bytes per object and, for segment-heavy messages, roughly 160 times the size of the input
 * (a 1 MB message with 17,000 OBX segments retains about 159 MB; plain text retains about 1 times its size). The
 * worst case is a segment of one-character fields (`PID|` followed by `a|` 500,000 times), which retains about 450
 * times the size of the input: 1 MB of input can retain 450 MB. The library sets no size limit, so limit the size of
 * untrusted input before calling `parse`, sized from that factor (256 KB is about 115 MB), and parse the messages of
 * a batch one at a time. See SECURITY.md.
 *
 * @param input - One message as text. Use `splitBatch` for batch files or streams with several messages.
 * @returns The message and its issues, or why it could not be parsed.
 *
 * @example
 * ```ts
 * import type { Issue } from "hl7-to-fhir";
 * import { get, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam");
 * if (result.ok) {
 *   console.log(get(result.value.message, "PID.5.1")); // => "Everyman"
 *   const notable: Issue[] = result.value.issues.filter((issue) => issue.severity !== "info");
 *   for (const { code, message } of notable) console.warn(code, message);
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export function parse(input: string): Result<ParseSuccess, ParseFailure> {
  if (!isString(input)) {
    const cause = issue("INVALID_INPUT", { span: { start: 0, end: 0 } });
    return err({ code: cause.code, message: cause.message, issues: [cause] });
  }
  const issues: Issue[] = [];
  const lines = splitLines(input, locateContent(input, issues), issues);

  const msh = lines[0];
  if (msh === undefined) {
    return parseFailure(
      input,
      issues,
      issue("EMPTY_INPUT", { span: { start: 0, end: input.length } }),
    );
  }
  if (!input.startsWith(headerSegmentId, msh.start)) {
    return parseFailure(
      input,
      issues,
      issue("MISSING_MSH", { span: msh, segmentIndex: 0 }),
    );
  }
  const reading = readDelimiters(input, msh, issues);
  if (!reading.ok) return parseFailure(input, issues, reading.error);

  const { delimiters } = reading.value;
  // The character set must be known before values are decoded, so it is read from the raw header text.
  const context = {
    delimiters,
    charset: readCharset(input, msh, delimiters, issues),
  };
  const declaration = { start: msh.start, end: reading.value.encoding.end };
  const segments = lines.map((span, index) => {
    if (index > 0) checkLaterHeader(input, span, index, declaration, issues);
    // The first segment is the one whose MSH-2 the delimiters were read from.
    const encoding = index === 0 ? reading.value.encoding : undefined;
    return parseSegment(input, span, index, context, issues, encoding);
  });
  const version = versionOf(segments[0]);
  // An absent version is left out instead of set to undefined, so the tree keeps its keys through JSON.
  const message: Hl7Message = {
    delimiters,
    ...(version === undefined ? {} : { version }),
    segments,
  };
  return ok({ message, issues: finishIssues(issues, input.length) });
}

function parseFailure(
  input: string,
  issues: readonly Issue[],
  cause: IssueOf<ParseFailureCode>,
): Result<never, ParseFailure> {
  return err({
    code: cause.code,
    message: cause.message,
    issues: finishIssues(issues, input.length).concat(cause),
  });
}
