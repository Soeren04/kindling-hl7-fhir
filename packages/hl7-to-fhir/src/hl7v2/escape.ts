// Escape sequences (HL7 v2.5.1 chapter 2.7). Decoding turns the raw text of a subcomponent into the text a reader
// sees; encoding is the inverse for text that has to be written into a message.
import type { IssueCode, Span } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { type Charset, decodeBytes } from "./charset";
import { indexOfOrEnd } from "./input";
import type { Delimiters } from "./model";

/** What decoding needs to know about the message. */
export interface DecodeContext {
  /** The message delimiters; `escape` starts and ends every sequence. */
  readonly delimiters: Delimiters;
  /** The character set for hexadecimal escape sequences. */
  readonly charset: Charset;
}

/** The issues decoding can find. */
export type DecodeIssueCode = Extract<
  IssueCode,
  | "VALUE_TRUNCATED"
  | "UNKNOWN_ESCAPE"
  | "UNTERMINATED_ESCAPE"
  | "FORMATTING_REMOVED"
  | "CHARACTER_SET_ESCAPE_KEPT"
  | "LOCAL_ESCAPE_KEPT"
  | "INVALID_HEX_ESCAPE"
  | "UNSUPPORTED_CHARACTER_SET"
>;

/** Receives an issue about the escape sequence (delimiters included) or truncation character at `span`. */
export type DecodeIssueReporter = (code: DecodeIssueCode, span: Span) => void;

/** A decoded value. */
export interface DecodedText {
  /** The text a reader sees, without the truncation character. */
  readonly value: string;
  /** Whether the raw text ends with the truncation character outside an escape sequence. */
  readonly truncated: boolean;
}

/**
 * Decodes the escape sequences in `input` between `span.start` and `span.end`.
 *
 * - `\F\ \S\ \T\ \R\ \E\` become the field, component, subcomponent, repetition and escape delimiter, and `\P\` the
 *   truncation character when the message declares one.
 * - `\Xhh…\` becomes the characters the bytes encode in the message character set.
 * - `\.br\`, `\.sp\` and `\.ce\` become a line feed; `\H\`, `\N\` and the other formatting commands are removed.
 * - Character set switches (`\C…\`, `\M…\`), locally defined (`\Z…\`), unknown, malformed and unterminated
 *   sequences are kept as written.
 *
 * - The truncation character, when the message declares one (version 2.7 and later), marks a value the sender cut
 *   off if it is the last character and not inside an escape sequence. It is left out of the value; written as
 *   `\P\`, it is a literal character instead.
 *
 * Every case except the delimiter escapes and line breaks is reported, located in the input.
 */
export function decodeText(
  input: string,
  span: Span,
  context: DecodeContext,
  report: DecodeIssueReporter,
): DecodedText {
  const { escape, truncation } = context.delimiters;
  // MSH-2 declares the truncation character after the escape character, so without one there is neither.
  if (escape === undefined) {
    return { value: input.slice(span.start, span.end), truncated: false };
  }
  const truncated =
    truncation !== undefined &&
    span.end > span.start &&
    input.charAt(span.end - 1) === truncation &&
    !endsInsideEscape(input, span, escape);
  const end = truncated ? span.end - 1 : span.end;
  if (truncated) report("VALUE_TRUNCATED", { start: end, end: span.end });
  const parts: string[] = [];
  let copied = span.start;
  let open = indexOfOrEnd(input, escape, span.start, end);
  while (open < end) {
    const close = indexOfOrEnd(input, escape, open + 1, end);
    if (close === end) {
      report("UNTERMINATED_ESCAPE", { start: open, end });
      break;
    }
    const content = input.slice(open + 1, close);
    const { text, issue } = interpret(content, escape, context);
    parts.push(input.slice(copied, open), text ?? input.slice(open, close + 1));
    if (issue !== undefined) report(issue, { start: open, end: close + 1 });
    copied = close + 1;
    open = indexOfOrEnd(input, escape, copied, end);
  }
  parts.push(input.slice(copied, end));
  return { value: parts.join(""), truncated };
}

/**
 * Whether the last character of the span lies inside an escape sequence: escape characters open and close sequences
 * in turn, so an odd number of them leaves the last sequence open.
 */
function endsInsideEscape(input: string, span: Span, escape: string): boolean {
  let open = false;
  for (let index = span.start; index < span.end; index++) {
    if (input.charAt(index) === escape) open = !open;
  }
  return open;
}

/** What the text around a value allows, which decides how characters without a plain form are written. */
export interface EncodeContext {
  /** The message delimiters. */
  readonly delimiters: Delimiters;
  /**
   * Whether hexadecimal escape sequences of ASCII bytes read back: true unless the character set of the message
   * (MSH-18) is one the library cannot decode, such as UTF-16.
   */
  readonly hexEscapes: boolean;
  /**
   * Whether a raw line feed reads back as data: true outside the first MSH segment of text whose segments end with
   * carriage returns, as `stringify` writes it. In the first MSH segment, a line feed would end the segment.
   */
  readonly lineFeedIsData: boolean;
}

/**
 * Why a value cannot be written.
 *
 * - `ESCAPE_CHARACTER_REQUIRED`: the value needs an escape sequence, but the message declares no escape character.
 * - `HEX_ESCAPE_UNSUPPORTED`: the value needs a hexadecimal escape sequence, which does not read back in the
 *   character set of the message.
 */
export type EncodeFailureCode =
  "ESCAPE_CHARACTER_REQUIRED" | "HEX_ESCAPE_UNSUPPORTED";

/**
 * Escapes `value` so that it can be written as one subcomponent, the inverse of {@link decodeText}.
 *
 * - Delimiters, and the truncation character if declared, become their escape sequences (`\F\`, `\S\`, ...).
 * - A carriage return, which would end the segment, becomes `\X0D\`.
 * - A line feed becomes `\X0A\`, which is valid in every text data type. Where hexadecimal escapes do not read
 *   back, it becomes `\.br\` unless "." is a delimiter, and without an escape character it is written as it is where
 *   it reads back as data.
 * - The first quote of a value of exactly `""` becomes `\X22\`, so the value is not read as the HL7 null.
 *
 * @returns The escaped text in pieces, to be concatenated by the caller, or why the value cannot be written.
 */
export function encodeText(
  value: string,
  context: EncodeContext,
): Result<readonly string[], EncodeFailureCode> {
  const pieces: string[] = [];
  let copied = 0;
  for (
    let index = nextCandidate(value, 0);
    index < value.length;
    index = nextCandidate(value, index + 1)
  ) {
    const sequence = escapeSequenceFor(value, index, context);
    if (sequence === undefined) continue;
    if (!sequence.ok) return sequence;
    pieces.push(value.slice(copied, index), sequence.value);
    copied = index + 1;
  }
  pieces.push(value.slice(copied));
  return ok(pieces);
}

// Delimiters are printable ASCII punctuation, and the other characters that may need an escape sequence are the
// line terminators and the quote: letters, digits, spaces and everything beyond ASCII stand for themselves. A native
// search for the rest keeps the scan of long values fast.
const candidates = /[^\d a-z\x7F-\u{10FFFF}]/iu;

/** The offset of the next character at or after `from` that may need an escape sequence, or the length of `value`. */
function nextCandidate(value: string, from: number): number {
  const found = value.slice(from).search(candidates);
  return found === -1 ? value.length : from + found;
}

/**
 * How the character at `index` must be written: `undefined` when it stands for itself, otherwise its replacement
 * (an escape sequence or, for a line feed without escape character, the line feed itself).
 */
function escapeSequenceFor(
  value: string,
  index: number,
  context: EncodeContext,
): Result<string, EncodeFailureCode> | undefined {
  const { delimiters, hexEscapes, lineFeedIsData } = context;
  const { escape } = delimiters;
  const character = value.charAt(index);
  const delimiter = delimiterSequenceFor(character, delimiters);
  if (delimiter !== undefined) {
    return escape === undefined
      ? err("ESCAPE_CHARACTER_REQUIRED")
      : ok(escape + delimiter + escape);
  }
  if (character === "\n") {
    if (escape !== undefined) {
      if (hexEscapes) return ok(`${escape}X0A${escape}`);
      // The command `.br` contains a period: as a delimiter it would split or end the sequence.
      return usesPeriod(delimiters)
        ? err("HEX_ESCAPE_UNSUPPORTED")
        : ok(`${escape}.br${escape}`);
    }
    return lineFeedIsData ? ok(character) : err("ESCAPE_CHARACTER_REQUIRED");
  }
  // Written as is, a value of exactly `""` would read as the HL7 null; a hexadecimal escape for its first quote
  // keeps it a value. The quote is no delimiter here, or it would have been escaped above.
  const hex =
    character === "\r" ? "X0D" : index === 0 && value === '""' ? "X22" : "";
  if (hex === "") return undefined;
  if (escape === undefined) return err("ESCAPE_CHARACTER_REQUIRED");
  return hexEscapes ? ok(escape + hex + escape) : err("HEX_ESCAPE_UNSUPPORTED");
}

function usesPeriod(delimiters: Delimiters): boolean {
  const { field, component, repetition, subcomponent, escape } = delimiters;
  return [field, component, repetition, subcomponent, escape].includes(".");
}

/** The escape sequence content for a delimiter character, or `undefined` for any other character. */
function delimiterSequenceFor(
  character: string,
  delimiters: Delimiters,
): string | undefined {
  switch (character) {
    case delimiters.field:
      return "F";
    case delimiters.component:
      return "S";
    case delimiters.subcomponent:
      return "T";
    case delimiters.repetition:
      return "R";
    case delimiters.escape:
      return "E";
    case delimiters.truncation:
      return "P";
    default:
      return undefined;
  }
}

/** The replacement for one escape sequence; `text` is absent when the sequence is kept as written. */
interface Interpretation {
  readonly text?: string;
  readonly issue?: DecodeIssueCode;
}

const unknown: Interpretation = { issue: "UNKNOWN_ESCAPE" };

const removedFormatting: Interpretation = {
  text: "",
  issue: "FORMATTING_REMOVED",
};

const lineBreak: Interpretation = { text: "\n" };

/** A line break whose formatting beyond the break itself (centering, extra blank lines) plain text cannot show. */
const lineBreakWithFormatting: Interpretation = {
  text: "\n",
  issue: "FORMATTING_REMOVED",
};

/** Interprets the content of one escape sequence, between the escape characters `escape`. */
function interpret(
  content: string,
  escape: string,
  context: DecodeContext,
): Interpretation {
  const { delimiters } = context;
  switch (content) {
    case "F":
      return { text: delimiters.field };
    case "S":
      return { text: delimiters.component };
    case "T":
      return delimiters.subcomponent === undefined
        ? unknown
        : { text: delimiters.subcomponent };
    case "R":
      return { text: delimiters.repetition };
    case "E":
      return { text: escape };
    case "P":
      return delimiters.truncation === undefined
        ? unknown
        : { text: delimiters.truncation };
    case "H":
    case "N":
      return removedFormatting;
    default:
      return interpretWithArgument(content, context.charset);
  }
}

/** Interprets the escape sequences that carry an argument after their first character. */
function interpretWithArgument(
  content: string,
  charset: Charset,
): Interpretation {
  switch (content.charAt(0)) {
    case "X":
      return decodeHex(content.slice(1), charset);
    case "C":
    case "M":
      return { issue: "CHARACTER_SET_ESCAPE_KEPT" };
    case "Z":
      return { issue: "LOCAL_ESCAPE_KEPT" };
    case ".":
      return interpretFormatting(content.slice(1, 3), content.slice(3));
    default:
      return unknown;
  }
}

/** What a formatting command accepts after its name: nothing, a count (`.sp2`) or a signed number (`.in-4`). */
type FormattingArgument = "none" | "count" | "signed";

// The formatting commands of the FT data type (HL7 v2.5.1 section 2.7.6). `.br`, `.sp` and `.ce` end the current line,
// so they become a line feed; `.ce` also centers the next line, which plain text cannot show, so it is reported like
// the commands that are removed. `.spN` skips N lines; for N above one it still becomes one line feed, so that a
// short sequence cannot expand into a long value, and the lost lines are reported. The argument is optional for every
// command that takes one.
const formattingCommands: ReadonlyMap<
  string,
  { readonly argument: FormattingArgument; readonly effect: Interpretation }
> = new Map([
  ["br", { argument: "none", effect: lineBreak }],
  ["sp", { argument: "count", effect: lineBreak }],
  ["ce", { argument: "none", effect: lineBreakWithFormatting }],
  ["fi", { argument: "none", effect: removedFormatting }],
  ["nf", { argument: "none", effect: removedFormatting }],
  ["in", { argument: "signed", effect: removedFormatting }],
  ["ti", { argument: "signed", effect: removedFormatting }],
  ["sk", { argument: "count", effect: removedFormatting }],
]);

// Bounded by the escape sequence they are applied to and free of backtracking: an optional space, then digits, with
// a sign only where the command allows one.
const argumentPatterns: Readonly<Record<FormattingArgument, RegExp>> = {
  none: /^$/u,
  count: /^(?: ?\d+)?$/u,
  signed: /^(?: ?[+-]?\d+)?$/u,
};

function interpretFormatting(
  command: string,
  argument: string,
): Interpretation {
  const definition = formattingCommands.get(command);
  if (definition === undefined) return unknown;
  if (!argumentPatterns[definition.argument].test(argument)) return unknown;
  return command === "sp" && Number(argument) > 1
    ? lineBreakWithFormatting
    : definition.effect;
}

const invalidHex: Interpretation = { issue: "INVALID_HEX_ESCAPE" };

function decodeHex(digits: string, charset: Charset): Interpretation {
  const bytes = parseHexBytes(digits);
  if (bytes === undefined) return invalidHex;
  const text = decodeBytes(bytes, charset);
  return text.ok ? { text: text.value } : { issue: text.error };
}

function parseHexBytes(digits: string): Uint8Array | undefined {
  if (digits.length === 0 || digits.length % 2 !== 0) return undefined;
  const bytes = new Uint8Array(digits.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    const high = hexDigitValue(digits.charCodeAt(2 * index));
    const low = hexDigitValue(digits.charCodeAt(2 * index + 1));
    if (high === undefined || low === undefined) return undefined;
    bytes[index] = high * 16 + low;
  }
  return bytes;
}

function hexDigitValue(code: number): number | undefined {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  // Clearing bit 5 maps "a"-"f" onto "A"-"F" and leaves no other character in that range.
  const upper = code & ~0x20;
  return upper >= 0x41 && upper <= 0x46 ? upper - 0x41 + 10 : undefined;
}
