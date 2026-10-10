// Base64 for the data of an Attachment, written by hand: the library targets ES2022 without DOM or Node types, so
// neither `btoa` nor `Buffer` nor `TextEncoder` is available to it.

const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Canonical Base64: groups of four alphabet characters, the last one padded with at most two `=`. */
const base64 = /^(?:[\d+/A-Za-z]{4})*(?:[\d+/A-Za-z]{2}==|[\d+/A-Za-z]{3}=)?$/u;

/** The bytes as Base64 with padding (RFC 4648, section 4). */
export function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const group =
      ((bytes[index] ?? 0) << 16) |
      ((bytes[index + 1] ?? 0) << 8) |
      (bytes[index + 2] ?? 0);
    const length = Math.min(bytes.length - index, 3);
    for (let position = 0; position < 4; position++) {
      encoded +=
        position <= length
          ? alphabet.charAt((group >> (18 - 6 * position)) & 0x3f)
          : "=";
    }
  }
  return encoded;
}

/**
 * The text as canonical Base64 as FHIR's base64Binary accepts it, or `undefined` when it is not Base64. Whitespace
 * must be removed first. Unpadded Base64 (RFC 4648, section 3.2, which senders leave unpadded to save space) gets its
 * padding.
 */
export function canonicalBase64(text: string): string | undefined {
  const padded =
    text.includes("=") || text.length % 4 === 0
      ? text
      : text + "=".repeat(4 - (text.length % 4));
  return base64.test(padded) ? padded : undefined;
}

/** The UTF-8 bytes of a string; a lone surrogate becomes U+FFFD, as `TextEncoder` writes it. */
export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const point = code >= 0xd800 && code <= 0xdfff ? 0xfffd : code;
    if (point < 0x80) {
      bytes.push(point);
    } else if (point < 0x800) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      bytes.push(
        0xe0 | (point >> 12),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** The bytes of hexadecimal text (an even number of hexadecimal digits), or `undefined` when it is not that. */
export function decodeHex(text: string): Uint8Array | undefined {
  if (text.length % 2 !== 0 || !/^[\da-f]*$/iu.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(text.slice(2 * index, 2 * index + 2), 16);
  }
  return bytes;
}
