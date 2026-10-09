// Batch files and MLLP streams carry many messages in one text. This module cuts them apart without interpreting the
// messages: it only needs to recognize where a message starts (MSH), where it stops (the next MSH, an envelope
// segment, an MLLP end block or the end of the input) and which lines belong to no message.
import {
  finishIssues,
  type Issue,
  issue,
  isString,
  type LocatedIssue,
  report,
  type Span,
} from "../shared/issue";
import { isDelimiterCharacter } from "./delimiters";
import { fieldSeparatorOffset } from "./header";
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
 * import { splitBatch } from "hl7-to-fhir/hl7v2";
 *
 * declare const input: string;
 *
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
 * or `\r\n`, with the rule of `parse`: the terminator of each MSH segment decides, and in a message whose MSH ends
 * with `\r` or `\r\n`, a line feed on its own is data, so a line after it belongs to the segment before, even when it
 * starts with `MSH` or an envelope identifier. The final terminator of a message is kept, so each message can be
 * passed to `parse` as it is. Blank lines between messages are ignored.
 *
 * Unlike `parse`, this function cannot fail and never throws: it returns what it found, possibly no message. An input
 * that is not a string, such as an undecoded `Buffer` passed from plain JavaScript, yields no messages and one
 * `INVALID_INPUT` error issue. Everything else it removes or doubts is reported in `issues`, as `parse` does
 * (ADR 0003):
 *
 * - info: the byte order mark and MLLP framing that were removed;
 * - warning: an MLLP frame without end block, malformed MLLP framing (an end block without start block or without
 *   the carriage return after it, text between frames, several messages in one frame), text that belongs to no
 *   message and is dropped, an `FHS` or `BHS` inside an envelope of its kind that has no trailer yet, and a `BTS-1`
 *   or `FTS-1` count that differs from the number of messages or batches.
 *
 * Envelope segments are dropped without an issue, because removing them is the purpose of the function. Batches are
 * counted as HL7 v2.5.1 section 2.10.3 defines a file, `[FHS] { [BHS] { [MSH ...] } [BTS] } [FTS]`: messages without
 * `BHS` form a batch too. Offsets in the issues refer to `input`, not to the returned messages, which are independent
 * strings; the position of a message in the result tells which message a later `parse` issue belongs to.
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
  if (!isString(input)) {
    return {
      messages: [],
      issues: [issue("INVALID_INPUT", { span: { start: 0, end: 0 } })],
    };
  }
  const scan: Scan = {
    input,
    messages: [],
    issues: [],
    message: undefined,
    outside: undefined,
    frameStart: undefined,
    messagesInFrame: 0,
    afterFrame: false,
    lineFeedIsData: false,
    fileOpen: false,
    batch: "none",
    fileComponent: defaultComponent,
    batchComponent: defaultComponent,
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
  return {
    messages: scan.messages,
    issues: finishIssues(scan.issues, input.length),
  };
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
  /** Messages in the open frame; MLLP carries one per frame. */
  messagesInFrame: number;
  /** Whether an MLLP frame has ended and no text or start block followed yet, so text now lies between frames. */
  afterFrame: boolean;
  /** Whether the MSH of the message being read ends with `\r` or `\r\n`, which makes a line feed on its own data. */
  lineFeedIsData: boolean;
  /** Whether an `FHS` opened a file that no `FTS` has closed yet. */
  fileOpen: boolean;
  /** The batch being read: none, one a `BHS` opened, or one that messages without `BHS` opened. */
  batch: "none" | "explicit" | "implicit";
  /** The component separator the `FHS` of the open file declares, which ends `FTS-1.1`. */
  fileComponent: string;
  /** The component separator the `BHS` of the open batch declares, which ends `BTS-1.1`. */
  batchComponent: string;
  /** Messages in the batch being read, to check `BTS-1`. */
  messagesInBatch: number;
  /** Batches closed since the last `FHS` or `FTS`, to check `FTS-1`. */
  batchesInFile: number;
}

/** Handles the start block at `index` and returns the offset after it. */
function startFrame(scan: Scan, index: number): number {
  closeSection(scan);
  if (scan.frameStart !== undefined) reportUnterminated(scan, scan.frameStart);
  scan.frameStart = index;
  scan.messagesInFrame = 0;
  scan.afterFrame = false;
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

/** The segments that start or end a message: their lines end at every terminator, as the first line does in parse. */
const boundaries: ReadonlySet<string> = new Set([
  "MSH",
  "FHS",
  "BHS",
  "BTS",
  "FTS",
]);

/**
 * Reads the line at `start`, which ends at a terminator, an MLLP block or the end of the input, handles it and
 * returns the offset where the next line starts.
 */
function readLine(scan: Scan, start: number): number {
  const { input } = scan;
  const id = segmentIdAt(input, start);
  const lineFeedIsData =
    scan.message !== undefined && scan.lineFeedIsData && !boundaries.has(id);
  let end = start;
  while (end < input.length && !endsLine(input.charAt(end), lineFeedIsData)) {
    end++;
  }

  const marker = input.charAt(end);
  const framed = marker === mllpEndBlock;
  // The end block is followed by a carriage return in MLLP. Otherwise the terminator belongs to the segment, so a
  // message keeps its final terminator; a start block and the end of the input have none.
  const next =
    end +
    (framed
      ? input.charAt(end + 1) === "\r"
        ? 2
        : 1
      : terminatorLength(input, end, input.length));
  const contentEnd = framed ? end : next;

  if (!isBlank(input, start, end)) {
    if (scan.afterFrame) {
      reportMalformedFrame(scan, { start, end });
      scan.afterFrame = false;
    }
    readSegment(scan, id, start, end, contentEnd);
    if (id === "MSH") scan.lineFeedIsData = marker === "\r";
  }
  if (framed) endFrame(scan, end, next);
  return next;
}

function endsLine(character: string, lineFeedIsData: boolean): boolean {
  return (
    character === "\r" ||
    (character === "\n" && !lineFeedIsData) ||
    character === mllpEndBlock ||
    character === mllpStartBlock
  );
}

/**
 * The identifier the line at `start` starts with, read the way `parse` recognizes a header: three characters
 * followed by a delimiter or the end of the line. Otherwise, as for `MSHX|`, an empty string.
 */
function segmentIdAt(input: string, start: number): string {
  const after = input.charAt(start + 3);
  const idEnds =
    after === "" || endsLine(after, false) || isDelimiterCharacter(after);
  return idEnds ? input.slice(start, start + 3) : "";
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
  // MLLP ends a frame with the end block and a carriage return, after a start block.
  if (scan.frameStart === undefined || next - end === 1) {
    reportMalformedFrame(scan, { start: end, end: end + 1 });
  }
  scan.frameStart = undefined;
  scan.afterFrame = true;
}

/**
 * Reports a violation of the MLLP framing that the split tolerates: an end block without start block or without
 * the carriage return after it, text between frames, or a second message in one frame.
 */
function reportMalformedFrame(scan: Scan, span: Span): void {
  report(scan.issues, "MLLP_FRAME_MALFORMED", { span });
}

/**
 * Handles a segment with the identifier `id` (see `segmentIdAt`). `start` to `end` is its text and `contentEnd` the
 * offset after it, including its terminator (equal to `end` when a block character or the end of the input follows).
 */
function readSegment(
  scan: Scan,
  id: string,
  start: number,
  end: number,
  contentEnd: number,
): void {
  switch (id) {
    case "MSH":
      closeSection(scan);
      scan.message = { start, end: contentEnd };
      if (scan.frameStart !== undefined) {
        scan.messagesInFrame++;
        if (scan.messagesInFrame > 1) {
          reportMalformedFrame(scan, { start, end: start + id.length });
        }
      }
      if (scan.batch === "none") scan.batch = "implicit";
      scan.messagesInBatch++;
      break;
    case "FHS":
      closeSection(scan);
      if (scan.fileOpen) reportMisplaced(scan, id, start);
      closeBatch(scan);
      scan.fileOpen = true;
      scan.fileComponent = componentSeparatorAt(scan.input, start, end);
      scan.batchesInFile = 0;
      break;
    case "BHS":
      closeSection(scan);
      if (scan.batch === "explicit") reportMisplaced(scan, id, start);
      closeBatch(scan);
      scan.batch = "explicit";
      scan.batchComponent = componentSeparatorAt(scan.input, start, end);
      break;
    case "BTS":
      closeSection(scan);
      checkCount(
        scan,
        { start, end },
        scan.batchComponent,
        scan.messagesInBatch,
      );
      // A trailer closes a batch even without header or messages: [BHS] {MSH} [BTS] may be empty.
      countBatch(scan);
      break;
    case "FTS":
      closeSection(scan);
      closeBatch(scan);
      checkCount(scan, { start, end }, scan.fileComponent, scan.batchesInFile);
      scan.fileOpen = false;
      scan.fileComponent = defaultComponent;
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

/**
 * Counts the batch being read, if any, as closed. HL7 v2.5.1 section 2.10.3 defines a file as
 * `[FHS] { [BHS] { [MSH ...] } [BTS] } [FTS]`: header and trailer of a batch are optional, so messages without `BHS`
 * form a batch too, closed by the next `BTS`, `BHS`, `FHS` or `FTS`.
 */
function closeBatch(scan: Scan): void {
  if (scan.batch !== "none") countBatch(scan);
}

/** Counts the batch being read as closed, even an empty one. */
function countBatch(scan: Scan): void {
  scan.batchesInFile++;
  scan.batch = "none";
  scan.batchComponent = defaultComponent;
  scan.messagesInBatch = 0;
}

/**
 * Reports an envelope header inside an envelope of its own kind that is still open: an `FHS` before the `FTS` of the
 * file before, or a `BHS` before the `BTS` of the batch before. The counts start again from it.
 */
function reportMisplaced(scan: Scan, id: string, start: number): void {
  report(scan.issues, "UNEXPECTED_ENVELOPE_SEGMENT", {
    span: { start, end: start + id.length },
    segmentId: id,
  });
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

/** The separator HL7 v2 messages use for components unless a header declares another. */
const defaultComponent = "^";

/**
 * The component separator an `FHS` or `BHS` declares: the first of its encoding characters, which follow the field
 * separator as in MSH, or the default `^` when that is no delimiter.
 */
function componentSeparatorAt(
  input: string,
  start: number,
  end: number,
): string {
  const separatorStart = start + fieldSeparatorOffset;
  const component = input.slice(
    separatorStart + 1,
    Math.min(separatorStart + 2, end),
  );
  return isDelimiterCharacter(component) &&
    component !== input.charAt(separatorStart)
    ? component
    : defaultComponent;
}

/**
 * Compares the first component of field 1 of the trailer segment with the number found; an empty count is not sent
 * and not checked. The trailer is read with its own field separator and the component separator of its header.
 */
function checkCount(
  scan: Scan,
  trailer: Span,
  component: string,
  actual: number,
): void {
  const { input } = scan;
  const separatorStart = trailer.start + fieldSeparatorOffset;
  const separator = input.charAt(separatorStart);
  const valueStart = separatorStart + 1;
  const valueEnd = Math.min(
    indexOfOrEnd(input, separator, valueStart, trailer.end),
    indexOfOrEnd(input, component, valueStart, trailer.end),
  );
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
