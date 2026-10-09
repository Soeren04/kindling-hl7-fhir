// Batch files and MLLP streams carry many messages in one text. This module cuts them apart without interpreting the
// messages: it only needs to recognize where a message starts (MSH), where it stops (the next MSH, an envelope
// segment, an MLLP end block or the end of the input) and which lines belong to no message.
import {
  inInputOrder,
  type Issue,
  type LocatedIssue,
  report,
  type Span,
} from "../shared/issue";
import {
  byteOrderMark,
  indexOfOrEnd,
  mllpEndBlock,
  mllpStartBlock,
  terminatorLength,
} from "./input";

/**
 * The messages found in a batch file or stream, and what was dropped or doubtful on the way.
 *
 * @example
 * ```ts
 * const { messages, issues } = splitBatch(input);
 * console.log(messages.length, issues.length);
 * ```
 */
export interface BatchSplit {
  /** The messages in input order. Each starts with `MSH` and keeps its own segment terminators. */
  readonly messages: readonly string[];
  /** The issues in input order, located in the string passed to {@link splitBatch}. */
  readonly issues: readonly Issue[];
}

/**
 * Splits text that holds several HL7 v2 messages into single messages.
 *
 * The input may be a batch file (`FHS`, `BHS`, messages, `BTS`, `FTS`), a stream of MLLP frames (`0x0B` message
 * `0x1C` `0x0D`), plain concatenated messages, or a mixture. A message starts at an `MSH` segment and ends before
 * the next `MSH`, the next envelope segment, the MLLP end block or the end of the input. Segments end with `\r`, `\n`
 * or `\r\n`; the final terminator of a message is kept, so each message can be passed to `parse` as it is. Blank
 * lines between messages are ignored.
 *
 * Unlike `parse`, this function cannot fail: it returns what it found, possibly no message. Everything it removes or
 * doubts is reported in `issues`, as `parse` does (ADR 0003): the byte order mark and MLLP framing (info), an MLLP
 * frame without end block, text that belongs to no message and is dropped, and a `BTS-1` or `FTS-1` count that
 * differs from the number of messages or batches (warnings). Envelope segments are dropped without an issue,
 * because removing them is the purpose of the function. Offsets in the issues refer to `input`, not to the returned
 * messages, which are independent strings; the position of a message in the result tells which message a later
 * `parse` issue belongs to.
 *
 * The scan is a single pass over the characters, so the time is linear in the size of the input.
 *
 * @param input - The text of a batch file or stream.
 * @returns The messages and the issues found while splitting.
 *
 * @example
 * ```ts
 * import { parse, splitBatch } from "hl7-to-fhir/hl7v2";
 *
 * const input = [
 *   "FHS|^~\\&|LAB",
 *   "BHS|^~\\&|LAB",
 *   "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1",
 *   "PID|1||12345||Everyman^Adam",
 *   "MSH|^~\\&|LAB|HOSP|||20240115103100||ADT^A01|MSG00002|P|2.5.1",
 *   "PID|1||67890||Everywoman^Eve",
 *   "BTS|2",
 *   "FTS|1",
 * ].join("\r");
 *
 * const { messages } = splitBatch(input);
 * console.log(messages.length); // 2
 * for (const message of messages) {
 *   const result = parse(message);
 *   if (result.ok) console.log(result.value.message.segments.length); // 2
 * }
 * ```
 */
export function splitBatch(input: string): BatchSplit {
  const scan: Scan = {
    input,
    messages: [],
    issues: [],
    message: undefined,
    outside: undefined,
    frameStart: undefined,
    messagesInBatch: 0,
    batchesInFile: 0,
  };
  let index = 0;
  if (input.startsWith(byteOrderMark)) {
    report(scan.issues, "BYTE_ORDER_MARK_REMOVED", {
      span: { start: 0, end: 1 },
    });
    index = 1;
  }
  while (index < input.length) {
    index = input.startsWith(mllpStartBlock, index)
      ? startFrame(scan, index)
      : readLine(scan, index);
  }
  closeSection(scan);
  if (scan.frameStart !== undefined) reportUnterminated(scan, scan.frameStart);
  return { messages: scan.messages, issues: inInputOrder(scan.issues) };
}

/** The state of one pass over the input; the fields without `readonly` change as lines are read. */
interface Scan {
  readonly input: string;
  readonly messages: string[];
  readonly issues: LocatedIssue[];
  /** The message being read: from its MSH to the end of its last segment. */
  message: Span | undefined;
  /** Lines since the last message or envelope segment that belong to no message. */
  outside: Span | undefined;
  /** Offset of the MLLP start block of the frame that is open. */
  frameStart: number | undefined;
  /** Messages since the last `BHS` or `BTS`, to check `BTS-1`. */
  messagesInBatch: number;
  /** Batches since the last `FHS` or `FTS`, to check `FTS-1`. */
  batchesInFile: number;
}

/** Handles the start block at `index` and returns the offset after it. */
function startFrame(scan: Scan, index: number): number {
  closeSection(scan);
  if (scan.frameStart !== undefined) reportUnterminated(scan, scan.frameStart);
  scan.frameStart = index;
  report(scan.issues, "MLLP_FRAMING_REMOVED", {
    span: { start: index, end: index + 1 },
  });
  return index + 1;
}

function reportUnterminated(scan: Scan, frameStart: number): void {
  report(scan.issues, "MLLP_FRAME_UNTERMINATED", {
    span: { start: frameStart, end: frameStart + 1 },
  });
}

/**
 * Reads the line at `start`, which ends at a terminator, an MLLP block or the end of the input, handles it and
 * returns the offset where the next line starts.
 */
function readLine(scan: Scan, start: number): number {
  const { input } = scan;
  let end = start;
  while (end < input.length && !endsLine(input.charAt(end))) end++;

  const marker = input.charAt(end);
  let next = end;
  let contentEnd = end;
  if (marker === mllpEndBlock) {
    // The end block is followed by a carriage return in MLLP.
    next = end + (input.charAt(end + 1) === "\r" ? 2 : 1);
  } else if (marker === "\r" || marker === "\n") {
    // The terminator belongs to the segment, so a message keeps its final terminator.
    next = end + terminatorLength(input, end, input.length);
    contentEnd = next;
  }

  if (!isBlank(input, start, end)) readSegment(scan, start, end, contentEnd);
  if (marker === mllpEndBlock) endFrame(scan, end, next);
  return next;
}

function endsLine(character: string): boolean {
  return (
    character === "\r" ||
    character === "\n" ||
    character === mllpEndBlock ||
    character === mllpStartBlock
  );
}

function isBlank(input: string, start: number, end: number): boolean {
  for (let index = start; index < end; index++) {
    const character = input.charAt(index);
    if (character !== " " && character !== "\t") return false;
  }
  return true;
}

function endFrame(scan: Scan, end: number, next: number): void {
  closeSection(scan);
  report(scan.issues, "MLLP_FRAMING_REMOVED", {
    span: { start: end, end: next },
  });
  scan.frameStart = undefined;
}

/**
 * Handles a segment. `start` to `end` is its text and `contentEnd` the offset after it, including its terminator
 * (equal to `end` when a block character or the end of the input follows).
 */
function readSegment(
  scan: Scan,
  start: number,
  end: number,
  contentEnd: number,
): void {
  switch (segmentIdAt(scan.input, start, end)) {
    case "MSH":
      closeSection(scan);
      scan.message = { start, end: contentEnd };
      scan.messagesInBatch++;
      break;
    case "FHS":
      closeSection(scan);
      scan.batchesInFile = 0;
      break;
    case "BHS":
      closeSection(scan);
      scan.messagesInBatch = 0;
      scan.batchesInFile++;
      break;
    case "BTS":
      closeSection(scan);
      checkCount(scan, { start, end }, scan.messagesInBatch);
      scan.messagesInBatch = 0;
      break;
    case "FTS":
      closeSection(scan);
      checkCount(scan, { start, end }, scan.batchesInFile);
      scan.batchesInFile = 0;
      break;
    default:
      if (scan.message !== undefined) {
        scan.message = { start: scan.message.start, end: contentEnd };
      } else {
        scan.outside = { start: scan.outside?.start ?? start, end };
      }
  }
}

/** The identifier of the segment at `start`, or an empty string when the line does not start with one. */
function segmentIdAt(input: string, start: number, end: number): string {
  if (end - start < 3) return "";
  if (end - start > 3 && isAlphanumeric(input.charCodeAt(start + 3))) {
    return "";
  }
  return input.slice(start, start + 3);
}

function isAlphanumeric(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a)
  );
}

/** Ends the message being read and reports the text outside messages that came before the current line. */
function closeSection(scan: Scan): void {
  if (scan.message !== undefined) {
    scan.messages.push(scan.input.slice(scan.message.start, scan.message.end));
    scan.message = undefined;
  }
  if (scan.outside !== undefined) {
    report(
      scan.issues,
      "CONTENT_OUTSIDE_MESSAGE",
      { span: scan.outside },
      scan.input.slice(scan.outside.start, scan.outside.end),
    );
    scan.outside = undefined;
  }
}

/** Compares field 1 of the trailer segment with the number found; an empty count is not sent and not checked. */
function checkCount(scan: Scan, trailer: Span, actual: number): void {
  const { input } = scan;
  const separator = input.charAt(trailer.start + 3);
  const valueStart = trailer.start + 4;
  const valueEnd = indexOfOrEnd(input, separator, valueStart, trailer.end);
  const declared = parseCount(input.slice(valueStart, valueEnd).trim());
  if (declared === undefined || declared === actual) return;
  report(scan.issues, "BATCH_COUNT_MISMATCH", {
    span: { start: valueStart, end: valueEnd },
    segmentId: input.slice(trailer.start, trailer.start + 3),
    field: 1,
  });
}

/**
 * Reads a count of decimal digits. An empty text is "not sent" (`undefined`); anything else that is not a count
 * yields `NaN`, which differs from every actual count.
 */
function parseCount(text: string): number | undefined {
  if (text === "") return undefined;
  for (const character of text) {
    if (character < "0" || character > "9") return Number.NaN;
  }
  return Number(text);
}
