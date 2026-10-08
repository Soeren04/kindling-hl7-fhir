import type { Issue, LocatedIssue, Span } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { readDelimiters } from "./delimiters";
import { resolveCharset } from "./escape";
import { readHeaderValue } from "./header";
import { locateContent, terminatorLength } from "./input";
import type { Hl7Message, Segment } from "./model";
import { parseSegment } from "./segment";

/**
 * A successfully parsed message and everything the parser tolerated or could not interpret.
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
export interface ParsedMessage {
  /** The message tree. */
  readonly message: Hl7Message;
  /** Remarks in input order; parsing succeeded regardless of their severity. */
  readonly issues: readonly Issue[];
}

/**
 * Why the input could not be read as an HL7 v2 message at all.
 *
 * - `EMPTY_INPUT`: there is no text once framing and whitespace are removed.
 * - `MISSING_MSH`: the first segment is not `MSH`.
 * - `INVALID_FIELD_SEPARATOR`: MSH-1 is missing or not a printable ASCII punctuation character.
 * - `INVALID_ENCODING_CHARACTERS`: MSH-2 is empty or too long, or the delimiters are not distinct punctuation
 *   characters.
 */
export type ParseFailureCode =
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
 * `issues`. Parsing fails only when the input has no `MSH` segment first or its delimiters are unusable.
 *
 * Every node carries a span into `input`, the string passed in, even when framing was removed.
 *
 * @param input - One message as text. Use `splitBatch` for batch files or streams with several messages.
 * @returns The message and its issues, or why it could not be parsed.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam");
 * if (result.ok) {
 *   const pid = result.value.message.segments[1];
 *   const family = pid?.fields[4]?.repetitions[0]?.components[0]?.subcomponents[0];
 *   if (family?.kind === "value") console.log(family.value); // "Everyman"
 * } else {
 *   console.error(result.error.code);
 * }
 * ```
 */
export function parse(input: string): Result<ParsedMessage, ParseFailure> {
  const content = locateContent(input);
  const lines = splitLines(input, content.span);
  const issues = [...content.issues, ...lines.issues];

  const msh = lines.spans[0];
  if (msh === undefined) {
    return fail(issues, {
      code: "EMPTY_INPUT",
      severity: "error",
      message: "The input contains no segments.",
      location: { span: { start: 0, end: input.length } },
    });
  }
  if (!input.startsWith("MSH", msh.start)) {
    return fail(issues, {
      code: "MISSING_MSH",
      severity: "error",
      message:
        "The first segment is not MSH. Batch files (FHS, BHS) must be split into messages first.",
      location: { span: msh, segmentIndex: 0 },
    });
  }
  const reading = readDelimiters(input, msh);
  if (!reading.ok) return fail(issues, reading.error);

  const { delimiters } = reading.value;
  const version = readHeaderValue(input, msh, delimiters, 12);
  const charset = resolveCharset(readHeaderValue(input, msh, delimiters, 18));
  const segments: Segment[] = [];
  issues.push(...reading.value.issues);
  for (const [index, span] of lines.spans.entries()) {
    const parsed = parseSegment(input, span, index, { delimiters, charset });
    segments.push(parsed.segment);
    issues.push(...parsed.issues);
  }
  const message: Hl7Message =
    version === undefined
      ? { delimiters, segments }
      : { delimiters, version, segments };
  return ok({ message, issues: inInputOrder(issues) });
}

/** The non-empty lines of the content, and remarks about blank lines and terminators. */
interface Lines {
  readonly spans: readonly Span[];
  readonly issues: readonly LocatedIssue[];
}

/**
 * Splits the content into segment spans at `\r`, `\n` and `\r\n`. Blank lines are dropped, and the first terminator
 * other than `\r` is reported once.
 */
function splitLines(input: string, content: Span): Lines {
  const spans: Span[] = [];
  const issues: LocatedIssue[] = [];
  let terminatorReported = false;
  let lineStart = content.start;
  let index = content.start;
  while (index < content.end) {
    const length = terminatorLength(input, index, content.end);
    if (length === 0) {
      index++;
      continue;
    }
    const terminator = { start: index, end: index + length };
    if (lineStart === index) {
      issues.push({
        code: "BLANK_LINE_REMOVED",
        severity: "info",
        message: "An empty line between segments was removed.",
        location: { span: terminator },
      });
    } else {
      spans.push({ start: lineStart, end: index });
    }
    const standard = length === 1 && input.charAt(index) === "\r";
    if (!standard && !terminatorReported) {
      issues.push(nonStandardTerminator(terminator));
      terminatorReported = true;
    }
    index += length;
    lineStart = index;
  }
  if (lineStart < content.end)
    spans.push({ start: lineStart, end: content.end });
  return { spans, issues };
}

function nonStandardTerminator(span: Span): LocatedIssue {
  return {
    code: "NON_STANDARD_SEGMENT_TERMINATOR",
    severity: "info",
    message:
      "Segments end with a line feed or a carriage return and line feed; HL7 v2 uses a carriage return alone.",
    location: { span },
  };
}

function fail(
  issues: readonly LocatedIssue[],
  cause: Issue & { readonly code: ParseFailureCode },
): Result<never, ParseFailure> {
  return err({
    code: cause.code,
    message: cause.message,
    issues: [...inInputOrder(issues), cause],
  });
}

/** Sorts issues by their position in the input; issues at the same position keep the order they were found in. */
function inInputOrder(issues: readonly LocatedIssue[]): LocatedIssue[] {
  return [...issues].sort(
    (a, b) => a.location.span.start - b.location.span.start,
  );
}
