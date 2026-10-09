import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type Charset,
  decodeBytes,
  resolveCharset,
} from "../../src/hl7v2/charset";

/** Decodes bytes written as hexadecimal digits, like the content of a `\X…\` escape sequence. */
function decodeHex(
  digits: string,
  charset: Exclude<Charset, "unsupported">,
): string | undefined {
  const bytes = Uint8Array.from(digits.match(/../gu) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return decodeBytes(bytes, charset);
}

describe("resolveCharset", () => {
  it.each<[string | undefined, Charset]>([
    [undefined, "ascii"],
    ["ASCII", "ascii"],
    ["8859/1", "iso-8859-1"],
    ["UNICODE UTF-8", "utf-8"],
    ["8859/15", "unsupported"],
    ["UNICODE", "unsupported"],
    ["utf-8", "unsupported"],
  ])("maps MSH-18 %j to %s", (msh18, charset) => {
    expect(resolveCharset(msh18)).toBe(charset);
  });
});

describe("decodeBytes", () => {
  it.each<[string, Exclude<Charset, "unsupported">, string | undefined]>([
    // ASCII ends at 0x7F.
    ["7F", "ascii", "\u007F"],
    ["80", "ascii", undefined],
    ["FF", "ascii", undefined],
    // ISO-8859-1 maps every byte to the code point of the same value, including the C1 controls that windows-1252
    // would turn into printable characters.
    ["80", "iso-8859-1", "\u0080"],
    ["9F", "iso-8859-1", "\u009F"],
    ["FF", "iso-8859-1", "ÿ"],
    // UTF-8 boundaries: the first and last code point of each sequence length.
    ["7F", "utf-8", "\u007F"],
    ["C280", "utf-8", "\u0080"],
    ["DFBF", "utf-8", "߿"],
    ["E0A080", "utf-8", "ࠀ"],
    ["EFBFBF", "utf-8", "￿"],
    ["F0908080", "utf-8", "\u{10000}"],
    ["F48FBFBF", "utf-8", "\u{10FFFF}"],
    // An encoded byte order mark is content.
    ["EFBBBF41", "utf-8", "\uFEFFA"],
    // Invalid UTF-8: overlong forms, surrogates, beyond U+10FFFF, stray and missing continuation bytes.
    ["E09080", "utf-8", undefined],
    ["F08FBFBF", "utf-8", undefined],
    ["C0AF", "utf-8", undefined],
    ["EDA080", "utf-8", undefined],
    ["EDBFBF", "utf-8", undefined],
    ["F4908080", "utf-8", undefined],
    ["80", "utf-8", undefined],
    ["C3", "utf-8", undefined],
    ["C341", "utf-8", undefined],
  ])("decodes %s in %s as %j", (digits, charset, text) => {
    expect(decodeHex(digits, charset)).toBe(text);
  });

  it("decodes long sequences without exceeding the argument limit", () => {
    const bytes = new Uint8Array(300_000).fill(0x41);
    expect(decodeBytes(bytes, "iso-8859-1")).toBe("A".repeat(300_000));
    expect(decodeBytes(bytes, "ascii")).toBe("A".repeat(300_000));
  });

  propertyTest.prop([fc.string({ unit: "grapheme" })])(
    "decodes the UTF-8 encoding of every string back to the string",
    (text) => {
      const bytes = new TextEncoder().encode(text);
      expect(decodeBytes(bytes, "utf-8")).toBe(text);
    },
  );
});
