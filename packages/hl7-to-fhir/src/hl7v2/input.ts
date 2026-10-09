// Real feeds wrap messages in transport artifacts: a byte order mark from a file, MLLP framing from a socket capture,
// a trailing newline from an editor. They are removed here, so the parser sees only segments, and every removal is
// reported (ADR 0003). Offsets stay those of the original input. The module also cuts the content into lines and
// holds the bounded scans the other modules use, so that no search runs past the segment it belongs to.
import { type LocatedIssue, report, type Span } from "../shared/issue";

export const byteOrderMark = "\uFEFF";
export const mllpStartBlock = "\u000B";
export const mllpEndBlock = "\u001C";

/**
 * Finds the segments in `input`: skips a leading byte order mark and MLLP start block, and an MLLP end block and
 * whitespace at the end. A single segment terminator after the last segment is kept; it is part of the message.
 *
 * @param issues - Receives one info issue per removed artifact.
 * @returns The span of the segments, including the terminator of the last one when present.
 */
export function locateContent(input: string, issues: LocatedIssue[]): Span {
  let start = 0;
  if (input.startsWith(byteOrderMark)) {
    report(issues, "BYTE_ORDER_MARK_REMOVED", {
      span: { start, end: start + 1 },
    });
    start += 1;
  }
  if (input.startsWith(mllpStartBlock, start)) {
    report(issues, "MLLP_FRAMING_REMOVED", { span: { start, end: start + 1 } });
    start += 1;
  }

  let end = input.length;
  let textEnd = endOfText(input, start, end);
  if (textEnd > start && input.charAt(textEnd - 1) === mllpEndBlock) {
    // The end block is followed by a carriage return in MLLP; anything after that is ordinary trailing whitespace.
    const frameEnd = textEnd + (input.charAt(textEnd) === "\r" ? 1 : 0);
    report(issues, "MLLP_FRAMING_REMOVED", {
      span: { start: textEnd - 1, end: frameEnd },
    });
    reportTrailingWhitespace(issues, frameEnd, end);
    end = textEnd - 1;
    textEnd = endOfText(input, start, end);
  }
  const contentEnd = textEnd + terminatorLength(input, textEnd, end);
  reportTrailingWhitespace(issues, contentEnd, end);
  return { start, end: contentEnd };
}

/**
 * Splits the content into segment spans at `\r`, `\n` and `\r\n`. Blank lines are dropped and reported, and the first
 * terminator other than `\r` is reported once.
 *
 * @param issues - Receives the issues about blank lines and terminators.
 * @returns The spans of the non-empty lines, without their terminators.
 */
export function splitLines(
  input: string,
  content: Span,
  issues: LocatedIssue[],
): Span[] {
  const spans: Span[] = [];
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
      report(issues, "BLANK_LINE_REMOVED", { span: terminator });
    } else {
      spans.push({ start: lineStart, end: index });
    }
    const standard = length === 1 && input.charAt(index) === "\r";
    if (!standard && !terminatorReported) {
      report(issues, "NON_STANDARD_SEGMENT_TERMINATOR", { span: terminator });
      terminatorReported = true;
    }
    index += length;
    lineStart = index;
  }
  if (lineStart < content.end)
    spans.push({ start: lineStart, end: content.end });
  return spans;
}

/**
 * The length of the segment terminator at `index`: 2 for `\r\n`, 1 for `\r` or `\n`, 0 when there is none before
 * `end`.
 */
export function terminatorLength(
  input: string,
  index: number,
  end: number,
): number {
  if (index >= end) return 0;
  switch (input.charAt(index)) {
    case "\r":
      return index + 1 < end && input.charAt(index + 1) === "\n" ? 2 : 1;
    case "\n":
      return 1;
    default:
      return 0;
  }
}

/** The offset after the last character before `end` that is not whitespace, or `start` if there is none. */
function endOfText(input: string, start: number, end: number): number {
  let index = end;
  while (index > start && isWhitespace(input.charAt(index - 1))) index--;
  return index;
}

function isWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n"
  );
}

function reportTrailingWhitespace(
  issues: LocatedIssue[],
  start: number,
  end: number,
): void {
  if (start < end) {
    report(issues, "TRAILING_WHITESPACE_REMOVED", { span: { start, end } });
  }
}

/**
 * Finds `character` in `input` between `from` and `end`.
 *
 * Unlike `String.prototype.indexOf`, the search stops at `end`, so looking for a field inside one segment never
 * scans the rest of the message.
 *
 * @returns The offset of the character, or `end` when it does not occur in the range.
 */
export function indexOfOrEnd(
  input: string,
  character: string,
  from: number,
  end: number,
): number {
  let index = from;
  while (index < end && input.charAt(index) !== character) index++;
  return index;
}
