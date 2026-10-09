// Real feeds wrap messages in transport artifacts: a byte order mark from a file, MLLP framing from a socket capture,
// a trailing newline from an editor. They are removed here, so the parser sees only segments, and every removal is
// reported (ADR 0003). Offsets stay those of the original input. The module also cuts the content into lines and
// holds the bounded scans the other modules use, so that no search runs past the segment it belongs to.
import { type Issue, type Span } from "../shared/issue";
import { report } from "../shared/collect";

export const byteOrderMark = "\uFEFF";
export const mllpStartBlock = "\u000B";
export const mllpEndBlock = "\u001C";

/**
 * Finds the segments in `input`: skips a leading byte order mark and MLLP start block, and an MLLP end block and
 * whitespace at the end. Spaces and tabs at the end of the last segment are part of its last value and stay, like in
 * every other segment; a single segment terminator after the last segment is kept, as it is part of the message; the
 * whitespace and blank lines after that terminator are removed.
 *
 * @param issues - Receives one info issue per removed artifact.
 * @returns The span of the segments, including the terminator of the last one when present.
 */
export function locateContent(input: string, issues: Issue[]): Span {
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
  // Without any text, all of it is trailing whitespace.
  const contentEnd =
    textEnd > start
      ? endOfLastLine(input, textEnd, end, lineFeedEnds(input, start, end))
      : start;
  reportTrailingWhitespace(issues, contentEnd, end);
  return { start, end: contentEnd };
}

/**
 * Splits the content into segment spans. Blank lines are dropped and reported, and the first terminator other than
 * `\r` is reported once.
 *
 * The terminator of the first line, MSH, decides how segments end. After `\n`, every `\r`, `\n` and `\r\n` ends a
 * segment. After `\r` or `\r\n`, only those do: a line feed on its own is data, as the standard says, and stays in
 * its value with an info issue. A line feed that ends the content still ends the last segment, so that a newline an
 * editor added after a message does not change its last value.
 *
 * @param issues - Receives the issues about blank lines, terminators and line feeds kept as data.
 * @returns The spans of the non-empty lines, without their terminators.
 */
export function splitLines(
  input: string,
  content: Span,
  issues: Issue[],
): Span[] {
  const lineFeedIsTerminator = lineFeedEnds(input, content.start, content.end);
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
    const lineFeedAsData =
      !lineFeedIsTerminator &&
      input.charAt(index) === "\n" &&
      index + 1 < content.end;
    if (lineFeedAsData) {
      const span = { start: index, end: index + 1 };
      report(issues, "LINE_FEED_IN_SEGMENT", {
        span,
        segmentIndex: spans.length,
      });
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

/**
 * Whether the segments of the content end with a line feed alone: whether the first line ends with `\n` rather than
 * with `\r` or `\r\n`. Blank lines before it are skipped.
 */
function lineFeedEnds(input: string, start: number, end: number): boolean {
  let index = start;
  while (index < end && terminatorLength(input, index, end) > 0) index++;
  while (index < end && terminatorLength(input, index, end) === 0) index++;
  return input.charAt(index) === "\n";
}

/**
 * The end of the last line, given the end of its last character that is not whitespace: after the spaces and tabs
 * that follow it and the terminator after them, if any. When segments end with carriage returns, line feeds are
 * data, so the last line runs to the next carriage return.
 */
function endOfLastLine(
  input: string,
  textEnd: number,
  end: number,
  lineFeedIsTerminator: boolean,
): number {
  if (!lineFeedIsTerminator) {
    const carriageReturn = indexOfOrEnd(input, "\r", textEnd, end);
    if (carriageReturn < end) {
      return carriageReturn + terminatorLength(input, carriageReturn, end);
    }
  }
  let index = textEnd;
  while (index < end && isSpaceOrTab(input.charAt(index))) index++;
  return index + terminatorLength(input, index, end);
}

function isSpaceOrTab(character: string): boolean {
  return character === " " || character === "\t";
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
  issues: Issue[],
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
