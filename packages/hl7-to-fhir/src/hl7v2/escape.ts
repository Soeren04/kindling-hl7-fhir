// Escape sequences (HL7 v2.5.1 chapter 2.7). Decoding turns the raw text of a subcomponent into the text a reader
// sees; encoding is the inverse for text that has to be written into a message.
import type { IssueCode, Span } from "../shared/issue";
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
export type EscapeIssueCode = Extract<
  IssueCode,
  | "UNKNOWN_ESCAPE"
  | "UNTERMINATED_ESCAPE"
  | "FORMATTING_REMOVED"
  | "CHARACTER_SET_ESCAPE_KEPT"
  | "LOCAL_ESCAPE_KEPT"
  | "INVALID_HEX_ESCAPE"
  | "UNSUPPORTED_CHARACTER_SET"
>;

/** Receives an issue about the escape sequence at `span`, delimiters included. */
export type EscapeIssueReporter = (code: EscapeIssueCode, span: Span) => void;

/**
 * Decodes the escape sequences in `input` between `span.start` and `span.end`.
 *
 * - `\F\ \S\ \T\ \R\ \E\` become the field, component, subcomponent, repetition and escape delimiter, and `\P\` the
 *   truncation character when the message declares one.
 * - `\Xhh…\` becomes the characters the bytes encode in the message character set.
 * - `\.br\` and `\.sp\` become a line feed; `\H\`, `\N\` and the other formatting commands are removed.
 * - Character set switches (`\C…\`, `\M…\`), locally defined (`\Z…\`), unknown, malformed and unterminated
 *   sequences are kept as written.
 *
 * Every case except the delimiter escapes and line breaks is reported, located in the input.
 *
 * @returns The decoded text.
 */
export function decodeText(
  input: string,
  span: Span,
  context: DecodeContext,
  report: EscapeIssueReporter,
): string {
  const { escape } = context.delimiters;
  if (escape === undefined) return input.slice(span.start, span.end);
  const parts: string[] = [];
  let copied = span.start;
  let open = indexOfOrEnd(input, escape, span.start, span.end);
  while (open < span.end) {
    const close = indexOfOrEnd(input, escape, open + 1, span.end);
    if (close === span.end) {
      report("UNTERMINATED_ESCAPE", { start: open, end: span.end });
      break;
    }
    const content = input.slice(open + 1, close);
    const { text, issue } = interpret(content, escape, context);
    parts.push(input.slice(copied, open), text ?? input.slice(open, close + 1));
    if (issue !== undefined) report(issue, { start: open, end: close + 1 });
    copied = close + 1;
    open = indexOfOrEnd(input, escape, copied, span.end);
  }
  parts.push(input.slice(copied, span.end));
  return parts.join("");
}

/**
 * Escapes `value` so that it can be written as one subcomponent: delimiters (and the truncation character, if
 * declared) become their escape sequences, a line feed becomes `\.br\` (`\X0A\` if "." is a delimiter) and a
 * carriage return `\X0D\`, which would otherwise end the segment. The first quote of a value of exactly `""` is
 * written as `\X22\`, so the value is not read as the HL7 null.
 *
 * `decodeText` restores the original value in every supported character set.
 *
 * @returns The escaped text, or `undefined` when the value needs an escape sequence but the message declares no
 *   escape character.
 */
export function encodeText(
  value: string,
  delimiters: Delimiters,
): string | undefined {
  const { escape } = delimiters;
  // Written as is, a value of exactly `""` would read as the HL7 null; a hexadecimal escape for its first quote
  // keeps it a value. The second quote takes the normal path, which escapes it if the quote is a delimiter.
  const quotedNull = value === '""';
  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    const sequence =
      quotedNull && index === 0
        ? "X22"
        : escapeSequenceFor(character, delimiters);
    if (sequence === undefined) encoded += character;
    else if (escape === undefined) return undefined;
    else encoded += escape + sequence + escape;
  }
  return encoded;
}

function escapeSequenceFor(
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
    case "\n":
      // `\.br\` is what text fields use; it cannot be written when "." is a delimiter, the hexadecimal form can.
      return usesPeriod(delimiters) ? "X0A" : ".br";
    case "\r":
      return "X0D";
    default:
      return undefined;
  }
}

function usesPeriod(delimiters: Delimiters): boolean {
  const { field, component, repetition, subcomponent, escape } = delimiters;
  return [field, component, repetition, subcomponent, escape].includes(".");
}

/** The replacement for one escape sequence; `text` is absent when the sequence is kept as written. */
interface Interpretation {
  readonly text?: string;
  readonly issue?: EscapeIssueCode;
}

const unknown: Interpretation = { issue: "UNKNOWN_ESCAPE" };

const removedFormatting: Interpretation = {
  text: "",
  issue: "FORMATTING_REMOVED",
};

const lineBreak: Interpretation = { text: "\n" };

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

/** Formatting commands of the FT data type that take an optional numeric argument. */
const commandsWithArgument: ReadonlySet<string> = new Set([
  "sp",
  "in",
  "ti",
  "sk",
]);

/** Formatting commands of the FT data type that are removed. */
const removedCommands: ReadonlySet<string> = new Set([
  "fi",
  "nf",
  "ce",
  "in",
  "ti",
  "sk",
]);

// Bounded by the escape sequence it is applied to and free of backtracking: an optional space, sign and digits.
const numericArgument = /^ ?[+-]?\d*$/u;

function interpretFormatting(
  command: string,
  argument: string,
): Interpretation {
  const accepted =
    argument === "" ||
    (commandsWithArgument.has(command) && numericArgument.test(argument));
  if (!accepted) return unknown;
  if (command === "br" || command === "sp") return lineBreak;
  return removedCommands.has(command) ? removedFormatting : unknown;
}

const invalidHex: Interpretation = { issue: "INVALID_HEX_ESCAPE" };

function decodeHex(digits: string, charset: Charset): Interpretation {
  const bytes = parseHexBytes(digits);
  if (bytes === undefined) return invalidHex;
  if (charset === "unsupported") return { issue: "UNSUPPORTED_CHARACTER_SET" };
  const text = decodeBytes(bytes, charset);
  return text === undefined ? invalidHex : { text };
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
