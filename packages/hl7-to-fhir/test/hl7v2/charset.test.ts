import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type Charset,
  decodeBytes,
  resolveCharset,
} from "../../src/hl7v2/charset";
import type { IssueCode } from "../../src/shared/issue";
import { err, ok, type Result } from "../../src/shared/result";

/** Decodes bytes written as hexadecimal digits, like the content of a `\X…\` escape sequence. */
function decodeHex(digits: string, charset: Charset) {
  const bytes = Uint8Array.from(digits.match(/../gu) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return decodeBytes(bytes, charset);
}

describe("resolveCharset", () => {
  it.each<[string | undefined, Charset]>([
    [undefined, "ascii"],
    ["ASCII", "ascii"],
    ["ISO IR6", "ascii"],
    ["8859/1", "iso-8859-1"],
    ["8859/2", "ascii-compatible"],
    ["8859/15", "ascii-compatible"],
    ["ISO IR14", "ascii-compatible"],
    ["ISO IR87", "ascii-compatible"],
    ["ISO IR159", "ascii-compatible"],
    ["GB 18030-2000", "ascii-compatible"],
    ["KS X 1001", "ascii-compatible"],
    ["CNS 11643-1992", "ascii-compatible"],
    ["BIG-5", "ascii-compatible"],
    ["UNICODE UTF-8", "utf-8"],
    ["UNICODE", "unsupported"],
    ["UNICODE UTF-16", "unsupported"],
    ["UNICODE UTF-32", "unsupported"],
    ["8859/16", "unsupported"],
    ["KLINGON", "unsupported"],
  ])("maps the table 0211 code %j to %s", (msh18, charset) => {
    expect(resolveCharset(msh18)).toStrictEqual({
      charset,
      nonStandard: false,
    });
  });

  it.each<[string, Charset]>([
    ["ascii", "ascii"],
    ["US-ASCII", "ascii"],
    ["UTF-8", "utf-8"],
    ["utf8", "utf-8"],
    ["unicode utf-8", "utf-8"],
    ["ISO-8859-1", "iso-8859-1"],
    ["iso8859-1", "iso-8859-1"],
  ])("recognizes the non-standard spelling %j as %s", (msh18, charset) => {
    expect(resolveCharset(msh18)).toStrictEqual({ charset, nonStandard: true });
  });
});

describe("decodeBytes", () => {
  it.each<[string, Charset, Result<string, IssueCode>]>([
    // ASCII ends at 0x7F.
    ["7F", "ascii", ok("\u007F")],
    ["80", "ascii", err("INVALID_HEX_ESCAPE")],
    ["FF", "ascii", err("INVALID_HEX_ESCAPE")],
    // ASCII-compatible sets share ASCII below 0x80; their other bytes are not decoded.
    ["0A", "ascii-compatible", ok("\n")],
    ["41", "ascii-compatible", ok("A")],
    ["7F", "ascii-compatible", ok("\u007F")],
    ["80", "ascii-compatible", err("UNSUPPORTED_CHARACTER_SET")],
    ["41B0A1", "ascii-compatible", err("UNSUPPORTED_CHARACTER_SET")],
    ["41", "unsupported", err("UNSUPPORTED_CHARACTER_SET")],
    // ISO-8859-1 maps every byte to the code point of the same value, including the C1 controls that windows-1252
    // would turn into printable characters.
    ["80", "iso-8859-1", ok("\u0080")],
    ["9F", "iso-8859-1", ok("\u009F")],
    ["FF", "iso-8859-1", ok("\u00FF")],
    // UTF-8 boundaries: the first and last code point of each sequence length.
    ["7F", "utf-8", ok("\u007F")],
    ["C280", "utf-8", ok("\u0080")],
    ["DFBF", "utf-8", ok("\u07FF")],
    ["E0A080", "utf-8", ok("\u0800")],
    ["EFBFBF", "utf-8", ok("\uFFFF")],
    ["F0908080", "utf-8", ok("\u{10000}")],
    ["F48FBFBF", "utf-8", ok("\u{10FFFF}")],
    // An encoded byte order mark is content.
    ["EFBBBF41", "utf-8", ok("\uFEFFA")],
    // Invalid UTF-8: overlong forms, surrogates, beyond U+10FFFF, stray and missing continuation bytes.
    ["E09080", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["F08FBFBF", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["C0AF", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["EDA080", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["EDBFBF", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["F4908080", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["80", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["C3", "utf-8", err("INVALID_HEX_ESCAPE")],
    ["C341", "utf-8", err("INVALID_HEX_ESCAPE")],
  ])("decodes %s in %s", (digits, charset, result) => {
    expect(decodeHex(digits, charset)).toStrictEqual(result);
  });

  it("decodes long sequences without exceeding the argument limit", () => {
    const bytes = new Uint8Array(300_000).fill(0x41);
    expect(decodeBytes(bytes, "iso-8859-1")).toStrictEqual(
      ok("A".repeat(300_000)),
    );
    expect(decodeBytes(bytes, "ascii")).toStrictEqual(ok("A".repeat(300_000)));
  });

  propertyTest.prop([fc.string({ unit: "grapheme" })])(
    "decodes the UTF-8 encoding of every string back to the string",
    (text) => {
      const bytes = new TextEncoder().encode(text);
      expect(decodeBytes(bytes, "utf-8")).toStrictEqual(ok(text));
    },
  );
});
