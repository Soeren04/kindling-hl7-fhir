// Character sets (MSH-18, HL7 table 0211) matter to the parser only for hexadecimal escape sequences (`\Xhh…\`): the
// input is already text, but the bytes of such a sequence are encoded in the character set of the message.

/**
 * How the bytes of hexadecimal escape sequences are turned into text, from MSH-18.
 * `unsupported` keeps such sequences as written.
 */
export type Charset = "ascii" | "iso-8859-1" | "utf-8" | "unsupported";

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
 * Decodes bytes in a supported character set.
 *
 * @returns The text, or `undefined` when the bytes are not valid in the character set.
 */
export function decodeBytes(
  bytes: Uint8Array,
  charset: Exclude<Charset, "unsupported">,
): string | undefined {
  switch (charset) {
    case "ascii":
      return bytes.every((byte) => byte < 0x80) ? fromCodes(bytes) : undefined;
    case "iso-8859-1":
      // ISO-8859-1 maps every byte to the code point of the same value. It is decoded here because the WHATWG
      // encoding standard behind TextDecoder treats "iso-8859-1" as windows-1252, which differs in 0x80 to 0x9F.
      return fromCodes(bytes);
    case "utf-8":
      return decodeUtf8(bytes);
  }
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

function fromCodes(codes: Uint8Array): string {
  // String.fromCharCode(...codes) would exceed the argument limit for long sequences.
  let text = "";
  for (const code of codes) text += String.fromCharCode(code);
  return text;
}
