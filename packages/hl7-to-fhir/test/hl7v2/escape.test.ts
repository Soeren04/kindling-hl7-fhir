import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Charset } from "../../src/hl7v2/charset";
import {
  decodeText,
  type DecodedText,
  encodeText,
} from "../../src/hl7v2/escape";
import type { Delimiters } from "../../src/hl7v2/model";
import type { IssueCode } from "../../src/shared/issue";
import { delimiterSets } from "./arbitraries";

const standard: Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

const custom: Delimiters = {
  field: "#",
  component: "$",
  repetition: "*",
  escape: "!",
  subcomponent: "%",
  truncation: "?",
};

function decode(
  raw: string,
  charset: Charset = "ascii",
  delimiters: Delimiters = standard,
): DecodedText {
  return decodeText(
    raw,
    { start: 0, end: raw.length },
    { delimiters, charset },
  );
}

/** The decoded value and the codes of the problems, for compact table rows. */
function summary(decoded: DecodedText): [string, IssueCode[]] {
  return [decoded.value, decoded.problems.map(({ code }) => code)];
}

describe("decodeText", () => {
  describe("delimiter escapes (since 2.1)", () => {
    it.each([
      ["\\F\\ ", "| "],
      ["\\S\\ ", "^ "],
      ["\\T\\ ", "& "],
      ["\\R\\ ", "~ "],
      ["\\E\\ ", "\\ "],
      ["a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f", "a|b^c&d~e\\f"],
    ])("decodes %s to the delimiter", (raw, value) => {
      expect(summary(decode(raw))).toStrictEqual([value, []]);
    });

    it("uses the delimiters of the message", () => {
      expect(
        summary(decode("!F!!S!!T!!R!!E!!P!", "ascii", custom)),
      ).toStrictEqual(["#$%*!?", []]);
    });

    it("does not treat the standard escape character as special in a message with another one", () => {
      expect(summary(decode("\\F\\", "ascii", custom))).toStrictEqual([
        "\\F\\",
        [],
      ]);
    });
  });

  describe("truncation escape (since 2.7)", () => {
    it("decodes \\P\\ to the declared truncation character", () => {
      const delimiters = { ...standard, truncation: "#" };
      expect(summary(decode("\\P\\ ", "ascii", delimiters))).toStrictEqual([
        "# ",
        [],
      ]);
    });

    it("keeps \\P\\ when the message declares no truncation character", () => {
      expect(summary(decode("\\P\\ "))).toStrictEqual([
        "\\P\\ ",
        ["UNKNOWN_ESCAPE"],
      ]);
    });
  });

  describe("hexadecimal escapes (since 2.3)", () => {
    it.each<[string, Charset, string]>([
      ["\\X41\\ ", "ascii", "A "],
      ["\\X0D0A\\ ", "ascii", "\r\n "],
      ["\\X414243\\ ", "utf-8", "ABC "],
      ["\\XE9\\ ", "iso-8859-1", "é "],
      ["\\XFF\\ ", "iso-8859-1", "ÿ "],
      ["\\XC3A9\\ ", "utf-8", "é "],
      ["\\Xc3a9\\ ", "utf-8", "é "],
      ["\\XE282AC\\ ", "utf-8", "€ "],
      ["\\XF09F9880\\ ", "utf-8", "\u{1F600} "],
      ["\\XF48FBFBF\\ ", "utf-8", "\u{10FFFF} "],
    ])("decodes %s in %s", (raw, charset, value) => {
      expect(summary(decode(raw, charset))).toStrictEqual([value, []]);
    });

    it.each<[string, string, Charset]>([
      ["a byte above 0x7F in ASCII", "\\XE9\\", "ascii"],
      ["a truncated UTF-8 sequence", "\\XC3\\", "utf-8"],
      ["a UTF-8 continuation byte without lead byte", "\\X80\\", "utf-8"],
      [
        "a UTF-8 lead byte followed by a non-continuation byte",
        "\\XC341\\",
        "utf-8",
      ],
      ["an overlong UTF-8 encoding", "\\XE0808F\\", "utf-8"],
      ["the never-valid UTF-8 byte C0", "\\XC0AF\\", "utf-8"],
      ["a UTF-8 encoded surrogate", "\\XEDA080\\", "utf-8"],
      ["a code point above U+10FFFF", "\\XF4908080\\", "utf-8"],
      ["an odd number of digits", "\\X414\\", "ascii"],
      ["no digits", "\\X\\", "ascii"],
      ["a non-hexadecimal digit", "\\X4G\\", "ascii"],
      [
        "a non-hexadecimal digit in an unsupported character set",
        "\\XZZ\\",
        "unsupported",
      ],
    ])("keeps a sequence with %s", (_description, raw, charset) => {
      expect(summary(decode(raw, charset))).toStrictEqual([
        raw,
        ["INVALID_HEX_ESCAPE"],
      ]);
    });

    it("keeps hexadecimal escapes in an unsupported character set", () => {
      expect(summary(decode("\\X41\\", "unsupported"))).toStrictEqual([
        "\\X41\\",
        ["UNSUPPORTED_CHARACTER_SET"],
      ]);
    });

    it("decodes long sequences", () => {
      const raw = `\\X${"41".repeat(200_000)}\\`;
      expect(decode(raw).value).toBe("A".repeat(200_000));
    });
  });

  describe("formatting escapes (since 2.2)", () => {
    it.each([
      ["a\\.br\\b", "a\nb"],
      ["a\\.sp\\b", "a\nb"],
      ["a\\.sp3\\b", "a\nb"],
      ["a\\.sp 3\\b", "a\nb"],
    ])("turns the line break in %s into a line feed", (raw, value) => {
      expect(summary(decode(raw))).toStrictEqual([value, []]);
    });

    it.each([
      "\\H\\",
      "\\N\\",
      "\\.fi\\",
      "\\.nf\\",
      "\\.ce\\",
      "\\.in+4\\",
      "\\.in\\",
      "\\.ti-2\\",
      "\\.sk3\\",
    ])("removes %s with an info", (raw) => {
      const decoded = decode(`a${raw}b`);
      expect(summary(decoded)).toStrictEqual(["ab", ["FORMATTING_REMOVED"]]);
      expect(decoded.problems[0]?.severity).toBe("info");
    });

    it.each([
      "\\.br3\\",
      "\\.fi3\\",
      "\\.spx\\",
      "\\.sp3x\\",
      "\\.xy\\",
      "\\.b\\",
      "\\.\\",
    ])("keeps the unknown command %s", (raw) => {
      expect(summary(decode(raw))).toStrictEqual([raw, ["UNKNOWN_ESCAPE"]]);
    });
  });

  it.each<[string, string, IssueCode]>([
    [
      "a character set switch to a single-byte set",
      "\\C2842\\",
      "CHARACTER_SET_ESCAPE_KEPT",
    ],
    [
      "a character set switch to a multi-byte set",
      "\\M2442\\",
      "CHARACTER_SET_ESCAPE_KEPT",
    ],
    ["a locally defined sequence", "\\Zlocal\\", "LOCAL_ESCAPE_KEPT"],
    ["an unknown sequence", "\\Q\\", "UNKNOWN_ESCAPE"],
    ["an empty sequence", "\\\\", "UNKNOWN_ESCAPE"],
    [
      "an unknown sequence that starts like a known one",
      "\\FF\\",
      "UNKNOWN_ESCAPE",
    ],
  ])("keeps %s as written", (_description, raw, code) => {
    const decoded = decode(`a${raw}b`);
    expect(summary(decoded)).toStrictEqual([`a${raw}b`, [code]]);
    expect(decoded.problems[0]?.severity).toBe("warning");
  });

  it("keeps an unterminated sequence and the rest of the value", () => {
    expect(decode("a\\F\\b\\F")).toStrictEqual({
      value: "a|b\\F",
      problems: [
        {
          code: "UNTERMINATED_ESCAPE",
          severity: "warning",
          message: expect.any(String) as string,
          span: { start: 5, end: 7 },
        },
      ],
    });
  });

  it("locates problems in the input, not in the decoded value", () => {
    const input = "PID|a\\F\\b\\Zx\\c|d";
    const decoded = decodeText(
      input,
      { start: 4, end: 14 },
      { delimiters: standard, charset: "ascii" },
    );
    expect(decoded.value).toBe("a|b\\Zx\\c");
    expect(
      decoded.problems.map(({ span }) => input.slice(span.start, span.end)),
    ).toStrictEqual(["\\Zx\\"]);
  });

  it("returns text without escape sequences unchanged", () => {
    expect(decode("Everyman")).toStrictEqual({
      value: "Everyman",
      problems: [],
    });
  });

  propertyTest.prop([fc.string()])(
    "never puts the decoded text into problem messages",
    (text) => {
      for (const problem of decode(`\\Z${text}\\\\X${text}\\\\.${text}\\`)
        .problems) {
        expect(problem.message).not.toContain(`Z${text}`);
      }
    },
  );
});

describe("encodeText", () => {
  it.each([
    ["a|b^c&d~e\\f", "a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f"],
    ["line\nbreak", "line\\.br\\break"],
    ["carriage\rreturn", "carriage\\X0D\\return"],
    ["Everyman", "Everyman"],
    ["", ""],
    ['""', '\\X22\\"'],
    ['"""', '"""'],
  ])("encodes %j as %s", (value, encoded) => {
    expect(encodeText(value, standard)).toBe(encoded);
  });

  it("keeps a quoted null distinct when the quote is the escape character", () => {
    const quoteEscape = { ...standard, escape: '"' };
    const encoded = encodeText('""', quoteEscape);
    expect(encoded).toBe('"X22""E"');
    expect(decode(encoded, "ascii", quoteEscape).value).toBe('""');
  });

  it("writes a line feed as a hexadecimal escape when the period is a delimiter", () => {
    expect(encodeText("a\nb", { ...standard, component: "." })).toBe(
      "a\\X0A\\b",
    );
  });

  it("escapes the truncation character only when the message declares one", () => {
    expect(encodeText("#", standard)).toBe("#");
    expect(encodeText("#", { ...standard, truncation: "#" })).toBe("\\P\\");
  });

  it("uses the delimiters of the message", () => {
    expect(encodeText("#$%*!?\\", custom)).toBe("!F!!S!!T!!R!!E!!P!\\");
  });

  const charsets = fc.constantFrom<Charset>("ascii", "iso-8859-1", "utf-8");
  const withTruncation = fc.option(fc.constantFrom("#", "@", "`"), {
    nil: undefined,
  });

  propertyTest.prop([
    fc.string({ unit: "binary" }),
    delimiterSets,
    withTruncation,
    charsets,
  ])(
    "is undone by decodeText for every string",
    (value, delimiters, truncation, charset) => {
      const declared =
        truncation === undefined ||
        Object.values(delimiters).includes(truncation)
          ? delimiters
          : { ...delimiters, truncation };
      const encoded = encodeText(value, declared);
      expect(decode(encoded, charset, declared)).toStrictEqual({
        value,
        problems: [],
      });
    },
  );

  propertyTest.prop([fc.string(), delimiterSets])(
    "never writes a delimiter or a line terminator",
    (value, delimiters) => {
      const encoded = encodeText(value, delimiters);
      for (const forbidden of [
        delimiters.field,
        delimiters.component,
        delimiters.repetition,
        delimiters.subcomponent,
        "\r",
        "\n",
      ]) {
        expect(encoded).not.toContain(forbidden);
      }
    },
  );
});
