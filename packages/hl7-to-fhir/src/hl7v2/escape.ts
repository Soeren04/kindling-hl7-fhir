// Escape sequences (HL7 v2.5.1 chapter 2.7). Decoding turns the raw text of a subcomponent into the text a reader
// sees; encoding is the inverse for text that has to be written into a message.
import type { IssueCode, Severity, Span } from "../shared/issue";
import { indexOfOrEnd } from "./header";
import type { Delimiters } from "./model";

/**
 * How the bytes of hexadecimal escape sequences (`\Xhh…\`) are turned into text, from MSH-18.
 * `unsupported` keeps such sequences as written.
 */
export type Charset = "ascii" | "iso-8859-1" | "utf-8" | "unsupported";

/** What decoding needs to know about the message. */
export interface DecodeContext {
  /** The message delimiters; `escape` starts and ends every sequence. */
  readonly delimiters: Delimiters;
  /** The character set for hexadecimal escape sequences. */
  readonly charset: Charset;
}

/** A remark about one escape sequence, located in the input. */
interface EscapeProblem {
  /** The issue code. */
  readonly code: IssueCode;
  /** How serious the problem is. */
  readonly severity: Severity;
  /** A description without message content. */
  readonly message: string;
  /** The escape sequence, delimiters included. */
  readonly span: Span;
}

/** Decoded text and the remarks made while decoding it. */
export interface DecodedText {
  /** The decoded text. */
  readonly value: string;
  /** Remarks about escape sequences that were removed, kept as written or are malformed. */
  readonly problems: readonly EscapeProblem[];
}

/**
 * Maps MSH-18.1 to the character set used for hexadecimal escape sequences.
 *
 * An empty MSH-18 means ASCII, the HL7 default. `8859/1` and `UNICODE UTF-8` are the HL7 table 0211 codes for
 * ISO-8859-1 and UTF-8. Every other character set is `unsupported`.
 */
export function resolveCharset(msh18: string | undefined): Charset {
  switch (msh18) {
    case undefined:
    case "ASCII":
      return "ascii";
    case "8859/1":
      return "iso-8859-1";
    case "UNICODE UTF-8":
      return "utf-8";
    default:
      return "unsupported";
  }
}

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
 * Every case except the delimiter escapes and line breaks is reported as a problem.
 */
export function decodeText(
  input: string,
  span: Span,
  context: DecodeContext,
): DecodedText {
  const { escape } = context.delimiters;
  const parts: string[] = [];
  const problems: EscapeProblem[] = [];
  let copied = span.start;
  let open = indexOfOrEnd(input, escape, span.start, span.end);
  while (open < span.end) {
    const close = indexOfOrEnd(input, escape, open + 1, span.end);
    if (close === span.end) {
      problems.push({
        ...unterminated,
        span: { start: open, end: span.end },
      });
      break;
    }
    const { text, problem } = interpret(input.slice(open + 1, close), context);
    parts.push(input.slice(copied, open), text ?? input.slice(open, close + 1));
    if (problem !== undefined) {
      problems.push({ ...problem, span: { start: open, end: close + 1 } });
    }
    copied = close + 1;
    open = indexOfOrEnd(input, escape, copied, span.end);
  }
  parts.push(input.slice(copied, span.end));
  return { value: parts.join(""), problems };
}

/**
 * Escapes `value` so that it can be written as one subcomponent: delimiters (and the truncation character, if
 * declared) become their escape sequences, a line feed becomes `\.br\` and a carriage return `\X0D\`, which
 * would otherwise end the segment. A value of exactly `""` is written as `\X22\"` so it is not read as the HL7 null.
 *
 * `decodeText` restores the original value in every supported character set.
 */
export function encodeText(value: string, delimiters: Delimiters): string {
  const escape = (sequence: string) =>
    `${delimiters.escape}${sequence}${delimiters.escape}`;
  if (value === '""') return `${escape("X22")}"`;
  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    const sequence = escapeSequenceFor(character, delimiters);
    encoded += sequence === undefined ? character : escape(sequence);
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
      return ".br";
    case "\r":
      return "X0D";
    default:
      return undefined;
  }
}

/** A problem before it is located. */
type Remark = Omit<EscapeProblem, "span">;

/** The replacement for one escape sequence; `text` is absent when the sequence is kept as written. */
interface Interpretation {
  readonly text?: string;
  readonly problem?: Remark;
}

const unterminated: Remark = {
  code: "UNTERMINATED_ESCAPE",
  severity: "warning",
  message:
    "An escape sequence has no closing escape character; the rest of the value is kept as written.",
};

const unknown: Interpretation = {
  problem: {
    code: "UNKNOWN_ESCAPE",
    severity: "warning",
    message: "Unknown escape sequence; it is kept as written.",
  },
};

const removedFormatting: Interpretation = {
  text: "",
  problem: {
    code: "FORMATTING_REMOVED",
    severity: "info",
    message:
      "A text formatting escape sequence was removed; only line breaks have a plain-text equivalent.",
  },
};

const lineBreak: Interpretation = { text: "\n" };

function interpret(content: string, context: DecodeContext): Interpretation {
  const { delimiters } = context;
  switch (content) {
    case "F":
      return { text: delimiters.field };
    case "S":
      return { text: delimiters.component };
    case "T":
      return { text: delimiters.subcomponent };
    case "R":
      return { text: delimiters.repetition };
    case "E":
      return { text: delimiters.escape };
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
      return {
        problem: {
          code: "CHARACTER_SET_ESCAPE_KEPT",
          severity: "warning",
          message:
            "Character set switching escape sequences are not supported; the sequence is kept as written.",
        },
      };
    case "Z":
      return {
        problem: {
          code: "LOCAL_ESCAPE_KEPT",
          severity: "warning",
          message:
            "A locally defined escape sequence cannot be interpreted; it is kept as written.",
        },
      };
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

const malformedHex: Interpretation = {
  problem: {
    code: "INVALID_HEX_ESCAPE",
    severity: "warning",
    message:
      "A hexadecimal escape sequence needs an even, non-zero number of hexadecimal digits; it is kept as written.",
  },
};

const undecodableHex: Interpretation = {
  problem: {
    code: "INVALID_HEX_ESCAPE",
    severity: "warning",
    message:
      "A hexadecimal escape sequence contains bytes that are not valid in the message character set (MSH-18); it is kept as written.",
  },
};

const unsupportedCharset: Interpretation = {
  problem: {
    code: "UNSUPPORTED_CHARACTER_SET",
    severity: "warning",
    message:
      "The character set in MSH-18 is not supported for hexadecimal escape sequences; the sequence is kept as written.",
  },
};

function decodeHex(digits: string, charset: Charset): Interpretation {
  const bytes = parseHexBytes(digits);
  if (bytes === undefined) return malformedHex;
  if (charset === "unsupported") return unsupportedCharset;
  const text = decodeBytes(bytes, charset);
  return text === undefined ? undecodableHex : { text };
}

function parseHexBytes(digits: string): number[] | undefined {
  if (digits.length === 0 || digits.length % 2 !== 0) return undefined;
  const bytes: number[] = [];
  for (let index = 0; index < digits.length; index += 2) {
    const high = hexDigitValue(digits.charCodeAt(index));
    const low = hexDigitValue(digits.charCodeAt(index + 1));
    if (high === undefined || low === undefined) return undefined;
    bytes.push(high * 16 + low);
  }
  return bytes;
}

function hexDigitValue(code: number): number | undefined {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  // Clearing bit 5 maps "a"-"f" onto "A"-"F" and leaves no other character in that range.
  const upper = code & ~0x20;
  return upper >= 0x41 && upper <= 0x46 ? upper - 0x41 + 10 : undefined;
}

// TextDecoder is not part of ES2022 and the library has no runtime-specific dependencies, so the three supported
// encodings are decoded by hand. Each is a few lines.
function decodeBytes(
  bytes: readonly number[],
  charset: Exclude<Charset, "unsupported">,
): string | undefined {
  switch (charset) {
    case "ascii":
      return bytes.every((byte) => byte < 0x80) ? fromCodes(bytes) : undefined;
    case "iso-8859-1":
      // ISO-8859-1 maps every byte to the Unicode code point of the same value.
      return fromCodes(bytes);
    case "utf-8":
      return decodeUtf8(bytes);
  }
}

function fromCodes(codes: readonly number[]): string {
  // String.fromCodePoint(...codes) would exceed the argument limit for long sequences.
  return codes.map((code) => String.fromCodePoint(code)).join("");
}

/** Lead byte ranges of UTF-8 sequences longer than one byte (RFC 3629, section 4). */
const utf8Sequences = [
  { first: 0xc2, last: 0xdf, length: 2, payload: 0x1f, min: 0x80 },
  { first: 0xe0, last: 0xef, length: 3, payload: 0x0f, min: 0x800 },
  { first: 0xf0, last: 0xf4, length: 4, payload: 0x07, min: 0x10000 },
] as const;

/** Strict UTF-8 decoding: overlong forms, surrogates and code points above U+10FFFF are rejected. */
function decodeUtf8(bytes: readonly number[]): string | undefined {
  const codePoints: number[] = [];
  const remaining = bytes.values();
  for (
    let next = remaining.next();
    next.done !== true;
    next = remaining.next()
  ) {
    const lead = next.value;
    if (lead < 0x80) {
      codePoints.push(lead);
      continue;
    }
    const sequence = utf8Sequences.find(
      ({ first, last }) => lead >= first && lead <= last,
    );
    if (sequence === undefined) return undefined;
    let codePoint = lead & sequence.payload;
    for (let read = 1; read < sequence.length; read++) {
      const continuation = remaining.next();
      if (continuation.done === true || (continuation.value & 0xc0) !== 0x80) {
        return undefined;
      }
      codePoint = (codePoint << 6) | (continuation.value & 0x3f);
    }
    const surrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (codePoint < sequence.min || codePoint > 0x10ffff || surrogate) {
      return undefined;
    }
    codePoints.push(codePoint);
  }
  return fromCodes(codePoints);
}
