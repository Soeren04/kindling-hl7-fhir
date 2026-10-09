// Character sets (MSH-18, HL7 table 0211) matter to the parser only for hexadecimal escape sequences (`\Xhh…\`): the
// input is already text, but the bytes of such a sequence are encoded in the character set of the message.
import { err, ok, type Result } from "../shared/result";

/**
 * How the bytes of hexadecimal escape sequences are turned into text, from MSH-18.
 *
 * - `ascii`, `iso-8859-1` and `utf-8` are decoded completely.
 * - `ascii-compatible` is a character set whose bytes below 0x80 are ASCII: the other parts of ISO 8859 and the
 *   Japanese, Chinese and Korean sets of table 0211 (`ISO IR14`, `ISO IR87`, `ISO IR159`, `GB 18030-2000`,
 *   `KS X 1001`, `CNS 11643-1992`, `BIG-5`). Higher bytes need the tables of the set, which this library does not
 *   have.
 * - `unsupported` keeps every sequence as written. It covers the UTF-16 and UTF-32 sets of table 0211 (`UNICODE`,
 *   `UNICODE UTF-16`, `UNICODE UTF-32`), whose code units are wider than a byte, and every name the table does not
 *   define.
 */
export type Charset =
  "ascii" | "iso-8859-1" | "ascii-compatible" | "utf-8" | "unsupported";

/** The character set MSH-18 names, and whether it uses a spelling other than the one of HL7 table 0211. */
export interface ResolvedCharset {
  readonly charset: Charset;
  /** `true` for a common spelling that table 0211 does not use, such as `UTF-8` or `ascii`. */
  readonly nonStandard: boolean;
}

/** The codes of HL7 table 0211 and how they decode. */
const table0211: ReadonlyMap<string, Charset> = new Map<string, Charset>([
  ["ASCII", "ascii"],
  ["ISO IR6", "ascii"],
  ["8859/1", "iso-8859-1"],
  ...["2", "3", "4", "5", "6", "7", "8", "9", "15"].map(
    (part): [string, Charset] => [`8859/${part}`, "ascii-compatible"],
  ),
  ...[
    "ISO IR14",
    "ISO IR87",
    "ISO IR159",
    "GB 18030-2000",
    "KS X 1001",
    "CNS 11643-1992",
    "BIG-5",
  ].map((code): [string, Charset] => [code, "ascii-compatible"]),
  ["UNICODE UTF-8", "utf-8"],
]);

/** Spellings that senders use instead of the table 0211 codes, upper-cased. */
const aliases: ReadonlyMap<string, Charset> = new Map<string, Charset>([
  ["US-ASCII", "ascii"],
  ["UTF-8", "utf-8"],
  ["UTF8", "utf-8"],
  ["ISO-8859-1", "iso-8859-1"],
  ["ISO8859-1", "iso-8859-1"],
]);

/**
 * Maps MSH-18.1 to the character set used for hexadecimal escape sequences.
 *
 * An empty MSH-18 means ASCII, the HL7 default. The codes of HL7 table 0211 are recognized as written; table codes
 * in other letter case and common spellings such as `UTF-8` are recognized as `nonStandard`. Every other character
 * set is `unsupported`.
 */
export function resolveCharset(msh18: string | undefined): ResolvedCharset {
  if (msh18 === undefined) return { charset: "ascii", nonStandard: false };
  const standard = table0211.get(msh18);
  if (standard !== undefined) return { charset: standard, nonStandard: false };
  const upper = msh18.toUpperCase();
  const charset = table0211.get(upper) ?? aliases.get(upper);
  return charset === undefined
    ? { charset: "unsupported", nonStandard: false }
    : { charset, nonStandard: true };
}

// TextDecoder exists in every runtime the package supports (Node.js, browsers, Deno, Bun), but the ES2022 library
// typings it is compiled against do not declare it. This declaration covers exactly the use below.
declare const TextDecoder: new (
  label: "utf-8",
  options: { readonly fatal: true; readonly ignoreBOM: true },
) => { decode(input: Uint8Array): string };

// Fatal: malformed sequences, overlong forms, surrogates and code points above U+10FFFF throw instead of turning into
// U+FFFD. ignoreBOM: an encoded byte order mark is content here, not a signature to drop.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Decodes bytes in a character set.
 *
 * @returns The text, `INVALID_HEX_ESCAPE` when the bytes are not valid in the character set, or
 *   `UNSUPPORTED_CHARACTER_SET` when the library cannot decode them in it.
 */
export function decodeBytes(
  bytes: Uint8Array,
  charset: Charset,
): Result<string, "INVALID_HEX_ESCAPE" | "UNSUPPORTED_CHARACTER_SET"> {
  const ascii = bytes.every((byte) => byte < 0x80);
  switch (charset) {
    case "ascii":
      return ascii ? ok(fromCodes(bytes)) : err("INVALID_HEX_ESCAPE");
    case "ascii-compatible":
      return ascii ? ok(fromCodes(bytes)) : err("UNSUPPORTED_CHARACTER_SET");
    case "iso-8859-1":
      // ISO-8859-1 maps every byte to the code point of the same value. It is decoded here because the WHATWG
      // encoding standard behind TextDecoder treats "iso-8859-1" as windows-1252, which differs in 0x80 to 0x9F.
      return ok(fromCodes(bytes));
    case "utf-8":
      return decodeUtf8(bytes);
    case "unsupported":
      return err("UNSUPPORTED_CHARACTER_SET");
  }
}

function decodeUtf8(bytes: Uint8Array): Result<string, "INVALID_HEX_ESCAPE"> {
  try {
    return ok(utf8.decode(bytes));
  } catch {
    return err("INVALID_HEX_ESCAPE");
  }
}

function fromCodes(codes: Uint8Array): string {
  // String.fromCharCode(...codes) would exceed the argument limit for long sequences.
  let text = "";
  for (const code of codes) text += String.fromCharCode(code);
  return text;
}
