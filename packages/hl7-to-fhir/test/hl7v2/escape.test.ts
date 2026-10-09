import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Charset, decodesAsciiBytes } from "../../src/hl7v2/charset";
import {
  decodeText,
  encodeText,
  type DecodeIssueCode,
} from "../../src/hl7v2/escape";
import type { Delimiters } from "../../src/hl7v2/model";
import type { Span } from "../../src/shared/issue";
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

/** The decoded text and the issues reported while decoding it. */
interface Decoded {
  readonly value: string;
  readonly truncated: boolean;
  readonly issues: readonly { code: DecodeIssueCode; span: Span }[];
}

function decode(
  raw: string,
  charset: Charset = "ascii",
  delimiters: Delimiters = standard,
): Decoded {
  const issues: { code: DecodeIssueCode; span: Span }[] = [];
  const decoded = decodeText(
    raw,
    { start: 0, end: raw.length },
    { delimiters, charset },
    (code, span) => issues.push({ code, span }),
  );
  return { ...decoded, issues };
}

/** The decoded value and the codes of the issues, for compact table rows. */
function summary(decoded: Decoded): [string, DecodeIssueCode[]] {
  return [decoded.value, decoded.issues.map(({ code }) => code)];
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

    describe("a truncated value", () => {
      const delimiters = { ...standard, truncation: "#" };

      it.each([
        [
          "a value that ends with the truncation character",
          "Long text#",
          "Long text",
        ],
        ["a value of only the truncation character", "#", ""],
        [
          "a value that ends with an escape sequence and the character",
          "a\\T\\#",
          "a&",
        ],
        ["an escaped truncation character and the character", "\\P\\#", "#"],
      ])(
        "marks %s and leaves the character out",
        (_description, raw, value) => {
          expect(decode(raw, "ascii", delimiters)).toStrictEqual({
            value,
            truncated: true,
            issues: [
              {
                code: "VALUE_TRUNCATED",
                span: { start: raw.length - 1, end: raw.length },
              },
            ],
          });
        },
      );

      it.each([
        ["the character in the middle", "a#b", "a#b"],
        ["the escaped character at the end", "text\\P\\", "text#"],
      ])("keeps %s as content", (_description, raw, value) => {
        expect(summary(decode(raw, "ascii", delimiters))).toStrictEqual([
          value,
          [],
        ]);
        expect(decode(raw, "ascii", delimiters).truncated).toBe(false);
      });

      it("does not take the character inside an unterminated escape sequence for a truncation", () => {
        expect(summary(decode("a\\Q#", "ascii", delimiters))).toStrictEqual([
          "a\\Q#",
          ["UNTERMINATED_ESCAPE"],
        ]);
      });
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
      ["a\\.sp1\\b", "a\nb"],
      ["a\\.sp 1\\b", "a\nb"],
      ["a\\.sp0\\b", "a\nb"],
    ])("turns the line break in %s into a line feed", (raw, value) => {
      expect(summary(decode(raw))).toStrictEqual([value, []]);
    });

    it.each(["a\\.sp2\\b", "a\\.sp 3\\b", `a\\.sp${"9".repeat(400)}\\b`])(
      "turns %s, which skips several lines, into one line feed and reports the others",
      (raw) => {
        expect(summary(decode(raw))).toStrictEqual([
          "a\nb",
          ["FORMATTING_REMOVED"],
        ]);
      },
    );

    it("turns \\.ce\\ into a line feed and reports the centering it drops", () => {
      expect(summary(decode("a\\.ce\\b"))).toStrictEqual([
        "a\nb",
        ["FORMATTING_REMOVED"],
      ]);
    });

    it.each([
      "\\H\\",
      "\\N\\",
      "\\.fi\\",
      "\\.nf\\",
      "\\.in+4\\",
      "\\.in 4\\",
      "\\.in\\",
      "\\.ti-2\\",
      "\\.sk3\\",
      "\\.sk\\",
    ])("removes %s with an info", (raw) => {
      const decoded = decode(`a${raw}b`);
      expect(summary(decoded)).toStrictEqual(["ab", ["FORMATTING_REMOVED"]]);
    });

    it.each([
      "\\.br3\\",
      "\\.sp+3\\",
      "\\.sp-1\\",
      "\\.sk-2\\",
      "\\.ce2\\",
      "\\.in+\\",
      "\\.in  4\\",
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

  it.each<[string, string, DecodeIssueCode]>([
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
    expect(summary(decode(`a${raw}b`))).toStrictEqual([`a${raw}b`, [code]]);
  });

  it("keeps an unterminated sequence and the rest of the value", () => {
    expect(decode("a\\F\\b\\F")).toStrictEqual({
      value: "a|b\\F",
      truncated: false,
      issues: [{ code: "UNTERMINATED_ESCAPE", span: { start: 5, end: 7 } }],
    });
  });

  it("locates issues in the input, not in the decoded value", () => {
    const input = "PID|a\\F\\b\\Zx\\c|d";
    const spans: Span[] = [];
    const { value } = decodeText(
      input,
      { start: 4, end: 14 },
      { delimiters: standard, charset: "ascii" },
      (_code, span) => spans.push(span),
    );
    expect(value).toBe("a|b\\Zx\\c");
    expect(
      spans.map(({ start, end }) => input.slice(start, end)),
    ).toStrictEqual(["\\Zx\\"]);
  });

  it("keeps \\T\\ when the message declares no subcomponent separator", () => {
    const withoutSubcomponent: Delimiters = {
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
    };
    expect(
      summary(decode("\\T\\", "ascii", withoutSubcomponent)),
    ).toStrictEqual(["\\T\\", ["UNKNOWN_ESCAPE"]]);
  });

  it("returns the text as written when the message declares no escape character", () => {
    const withoutEscape: Delimiters = {
      field: "|",
      component: "^",
      repetition: "~",
    };
    expect(decode("a\\F\\b", "ascii", withoutEscape)).toStrictEqual({
      value: "a\\F\\b",
      truncated: false,
      issues: [],
    });
  });

  it("returns text without escape sequences unchanged", () => {
    expect(decode("Everyman")).toStrictEqual({
      value: "Everyman",
      truncated: false,
      issues: [],
    });
  });
});

/** Encodes `value` and returns the text, or the failure code. */
function encode(
  value: string,
  delimiters: Delimiters,
  { hexEscapes = true, lineFeedIsData = true } = {},
): string {
  const result = encodeText(value, { delimiters, hexEscapes, lineFeedIsData });
  return result.ok ? result.value.join("") : result.error;
}

describe("encodeText", () => {
  it.each([
    ["a|b^c&d~e\\f", "a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f"],
    ["line\nbreak", "line\\X0A\\break"],
    ["carriage\rreturn", "carriage\\X0D\\return"],
    ["Everyman", "Everyman"],
    ["", ""],
    ['""', '\\X22\\"'],
    ['"""', '"""'],
    ['a""', 'a""'],
  ])("encodes %j as %s", (value, encoded) => {
    expect(encode(value, standard)).toBe(encoded);
  });

  it("returns the text in pieces that share the unescaped runs", () => {
    expect(
      encodeText("a|b", {
        delimiters: standard,
        hexEscapes: true,
        lineFeedIsData: true,
      }),
    ).toStrictEqual({
      ok: true,
      value: ["a", "\\F\\", "b"],
    });
  });

  it("keeps a quoted null distinct when the quote is the escape character", () => {
    const quoteEscape = { ...standard, escape: '"' };
    const encoded = encode('""', quoteEscape);
    expect(encoded).toBe('"E""E"');
    expect(decode(encoded, "ascii", quoteEscape).value).toBe('""');
  });

  it("escapes the truncation character only when the message declares one", () => {
    expect(encode("#", standard)).toBe("#");
    expect(encode("#", { ...standard, truncation: "#" })).toBe("\\P\\");
  });

  it("uses the delimiters of the message", () => {
    expect(encode("#$%*!?\\", custom)).toBe("!F!!S!!T!!R!!E!!P!\\");
  });

  describe("in a character set without hexadecimal escapes", () => {
    const options = { hexEscapes: false };

    it("writes a line feed as a line break command", () => {
      expect(encode("a\nb", standard, options)).toBe("a\\.br\\b");
    });

    it.each(["a\rb", '""'])("cannot write %j", (value) => {
      expect(encode(value, standard, options)).toBe("HEX_ESCAPE_UNSUPPORTED");
    });

    it.each([
      "field",
      "component",
      "repetition",
      "subcomponent",
      "escape",
    ] as const)(
      "cannot write a line feed when the period is the %s delimiter",
      (delimiter) => {
        expect(encode("a\nb", { ...standard, [delimiter]: "." }, options)).toBe(
          "HEX_ESCAPE_UNSUPPORTED",
        );
      },
    );

    it("writes delimiters with their escape sequences", () => {
      expect(encode("a|b", standard, options)).toBe("a\\F\\b");
    });
  });

  describe("without an escape character", () => {
    const withoutEscape: Delimiters = {
      field: "|",
      component: "^",
      repetition: "~",
    };

    it.each(["a&b\\c", "line\nfeed"])(
      "writes %j, which needs no escape sequence there, as it is",
      (value) => {
        expect(encode(value, withoutEscape)).toBe(value);
      },
    );

    it.each(["a|b", "a^b", "a~b", "a\rb", '""'])("cannot write %j", (value) => {
      expect(encode(value, withoutEscape)).toBe("ESCAPE_CHARACTER_REQUIRED");
    });

    it("cannot write a line feed where it would end the segment", () => {
      expect(encode("a\nb", withoutEscape, { lineFeedIsData: false })).toBe(
        "ESCAPE_CHARACTER_REQUIRED",
      );
    });
  });

  const charsets = fc.constantFrom<Charset>(
    "ascii",
    "iso-8859-1",
    "ascii-compatible",
    "utf-8",
    "unsupported",
  );
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
      const hexEscapes = decodesAsciiBytes(charset);
      const encoded = encodeText(value, {
        delimiters: declared,
        hexEscapes,
        lineFeedIsData: false,
      });
      if (!encoded.ok) {
        // A value is refused only without an escape character, or for a hexadecimal escape that does not read back.
        expect(
          declared.escape === undefined ||
            (encoded.error === "HEX_ESCAPE_UNSUPPORTED" && !hexEscapes),
        ).toBe(true);
      } else {
        expect(decode(encoded.value.join(""), charset, declared)).toStrictEqual(
          {
            value,
            truncated: false,
            issues: [],
          },
        );
      }
    },
  );

  propertyTest.prop([fc.string(), delimiterSets, fc.boolean()])(
    "never writes a delimiter or a carriage return, nor a line feed unless it is data",
    (value, delimiters, lineFeedIsData) => {
      const result = encodeText(value, {
        delimiters,
        hexEscapes: true,
        lineFeedIsData,
      });
      const encoded = result.ok ? result.value.join("") : "";
      const { field, component, repetition, subcomponent = "\r" } = delimiters;
      for (const forbidden of [
        field,
        component,
        repetition,
        subcomponent,
        "\r",
      ]) {
        expect(encoded).not.toContain(forbidden);
      }
      if (!lineFeedIsData || delimiters.escape !== undefined) {
        expect(encoded).not.toContain("\n");
      }
    },
  );
});
