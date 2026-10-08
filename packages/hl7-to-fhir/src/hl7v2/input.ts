// Real feeds wrap messages in transport artifacts: a byte order mark from a file, MLLP framing from a socket capture,
// a trailing newline from an editor. They are removed here, so the parser sees only segments, and every removal is
// reported (ADR 0003). Offsets stay those of the original input. The module also cuts the content into lines and
// holds the bounded scans the other modules use, so that no search runs past the segment it belongs to.
import type { LocatedIssue, Span } from "../shared/issue";

/** Where the segments are in the input, and what was removed around them. */
export interface Content {
  /** The segments, including the terminator of the last one when present. */
  readonly span: Span;
  /** One info issue per removed artifact. */
  readonly issues: readonly LocatedIssue[];
}

export const byteOrderMark = "\uFEFF";
export const mllpStartBlock = "\u000B";
export const mllpEndBlock = "\u001C";

/**
 * Finds the segments in `input`: skips a leading byte order mark and MLLP start block, and an MLLP end block and
 * whitespace at the end. A single segment terminator after the last segment is kept; it is part of the message.
 */
export function locateContent(input: string): Content {
  const issues: LocatedIssue[] = [];
  let start = 0;
  if (input.startsWith(byteOrderMark)) {
    issues.push(
      removalIssue("BYTE_ORDER_MARK_REMOVED", { start, end: start + 1 }),
    );
    start += 1;
  }
  if (input.startsWith(mllpStartBlock, start)) {
    issues.push(
      removalIssue("MLLP_FRAMING_REMOVED", { start, end: start + 1 }),
    );
    start += 1;
  }

  let end = input.length;
  let textEnd = endOfText(input, start, end);
  if (textEnd > start && input.charAt(textEnd - 1) === mllpEndBlock) {
    // The end block is followed by a carriage return in MLLP; anything after that is ordinary trailing whitespace.
    const frameEnd = textEnd + (input.charAt(textEnd) === "\r" ? 1 : 0);
    issues.push(
      removalIssue("MLLP_FRAMING_REMOVED", {
        start: textEnd - 1,
        end: frameEnd,
      }),
    );
    issues.push(...trailingWhitespace(frameEnd, end));
    end = textEnd - 1;
    textEnd = endOfText(input, start, end);
  }
  const contentEnd = textEnd + terminatorLength(input, textEnd, end);
  issues.push(...trailingWhitespace(contentEnd, end));
  return { span: { start, end: contentEnd }, issues };
}

/** The non-empty lines of the content, and the issues about blank lines and terminators. */
export interface Lines {
  readonly spans: readonly Span[];
  readonly issues: readonly LocatedIssue[];
}

/**
 * Splits the content into segment spans at `\r`, `\n` and `\r\n`. Blank lines are dropped, and the first terminator
 * other than `\r` is reported once.
 */
export function splitLines(input: string, content: Span): Lines {
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

function trailingWhitespace(start: number, end: number): LocatedIssue[] {
  return start < end
    ? [removalIssue("TRAILING_WHITESPACE_REMOVED", { start, end })]
    : [];
}

const removalMessages = {
  BYTE_ORDER_MARK_REMOVED: "A byte order mark before the message was removed.",
  MLLP_FRAMING_REMOVED:
    "MLLP framing characters around the message were removed.",
  TRAILING_WHITESPACE_REMOVED: "Whitespace after the last segment was removed.",
} as const;

/** The info issue for an artifact removed from the input. */
export function removalIssue(
  code: keyof typeof removalMessages,
  span: Span,
): LocatedIssue {
  return {
    code,
    severity: "info",
    message: removalMessages[code],
    location: { span },
  };
}

/** Sorts issues by their position in the input; issues at the same position keep the order they were found in. */
export function inInputOrder(issues: readonly LocatedIssue[]): LocatedIssue[] {
  return [...issues].sort(
    (a, b) => a.location.span.start - b.location.span.start,
  );
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
