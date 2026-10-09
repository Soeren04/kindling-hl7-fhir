import {
  finishIssues,
  type Issue,
  issue,
  type IssueOf,
  isString,
  type LocatedIssue,
} from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { resolveCharset } from "./charset";
import { readDelimiters } from "./delimiters";
import { characterSetField, findHeaderValue, versionField } from "./header";
import { locateContent, splitLines } from "./input";
import type { Hl7Message } from "./model";
import { parseSegment } from "./segment";

/**
 * What {@link parse} returns when it succeeds, the counterpart of {@link ParseFailure}: the message and everything the
 * parser tolerated or could not interpret.
 *
 * @example
 * ```ts
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
 * - `INVALID_ENCODING_CHARACTERS`: MSH-2 is empty or too long, or the delimiters are not distinct punctuation
 *   characters.
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
 * const result = parse("PID|1");
 * if (!result.ok) console.error(result.error.code, result.error.message); // "MISSING_MSH", ...
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
 * Parsing is lenient (ADR 0003): segments may end with `\r`, `\n` or `\r\n`; a byte order mark, MLLP framing and
 * trailing whitespace are removed; unknown, Z and malformed segments are kept in order. Each deviation is reported in
 * `issues`. Parsing fails only when the input is not a string, has no `MSH` segment first or
 * declares unusable delimiters; it never throws.
 *
 * Every node carries a span into `input`, the string passed in, even when framing was removed. Read values with
 * `get` and `getAll` in HL7 notation (`PID.5.1`), or walk the tree, where `fields[n - 1]` is field `n` (ADR 0008).
 * The types of the issues are exported from the main entry point, `hl7-to-fhir`.
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
 *   console.log(get(result.value.message, "PID.5.1")); // "Everyman"
 *   const problems: Issue[] = result.value.issues.filter((issue) => issue.severity !== "info");
 *   for (const { code, message } of problems) console.warn(code, message);
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
  const issues: LocatedIssue[] = [];
  const lines = splitLines(input, locateContent(input, issues), issues);

  const msh = lines[0];
  if (msh === undefined) {
    return fail(
      input,
      issues,
      issue("EMPTY_INPUT", { span: { start: 0, end: input.length } }),
    );
  }
  if (!input.startsWith("MSH", msh.start)) {
    return fail(
      input,
      issues,
      issue("MISSING_MSH", { span: msh, segmentIndex: 0 }),
    );
  }
  const reading = readDelimiters(input, msh, issues);
  if (!reading.ok) return fail(input, issues, reading.error);

  const { delimiters } = reading.value;
  const headerValue = (field: number) => {
    const span = findHeaderValue(input, msh, delimiters, field);
    return span && input.slice(span.start, span.end);
  };
  const version = headerValue(versionField);
  const context = {
    delimiters,
    charset: resolveCharset(headerValue(characterSetField)),
  };
  const segments = lines.map((span, index) =>
    parseSegment(input, span, index, context, issues),
  );
  // An absent version is left out instead of set to undefined, so the tree keeps its keys through JSON.
  const message: Hl7Message = {
    delimiters,
    ...(version === undefined ? {} : { version }),
    segments,
  };
  return ok({ message, issues: finishIssues(issues, input.length) });
}

function fail(
  input: string,
  issues: readonly LocatedIssue[],
  cause: IssueOf<ParseFailureCode>,
): Result<never, ParseFailure> {
  return err({
    code: cause.code,
    message: cause.message,
    issues: finishIssues(issues, input.length).concat(cause),
  });
}
