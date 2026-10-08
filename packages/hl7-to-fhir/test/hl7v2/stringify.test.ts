import { describe, expect, it } from "vitest";

import type { Delimiters, Hl7Message, Segment } from "../../src/hl7v2/model";
import { stringify } from "../../src/hl7v2/stringify";
import { parsed } from "./helpers";

const standard: Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

const header = "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1";

/** Parses `input` and writes it again. */
function roundTrip(input: string): string {
  return stringify(parsed(input).message);
}

// Written as an escape so that editors and formatters cannot drop the invisible character.
const byteOrderMark = String.fromCodePoint(0xfeff);

const noSpan = { start: 0, end: 0 };

/** A segment built by hand: every value is a one-subcomponent field, `null` and `""` map to the other kinds. */
function segment(id: string, ...fields: (string | null)[]): Segment {
  return {
    id,
    span: noSpan,
    fields: fields.map((text) => ({
      span: noSpan,
      repetitions:
        text === ""
          ? []
          : [
              {
                span: noSpan,
                components: [
                  {
                    span: noSpan,
                    subcomponents: [
                      text === null
                        ? { kind: "null", span: noSpan }
                        : { kind: "value", value: text, span: noSpan },
                    ],
                  },
                ],
              },
            ],
    })),
  };
}

describe("stringify", () => {
  it("ends every segment, the last one included, with a carriage return", () => {
    expect(roundTrip(`${header}\rPID|1||12345\rZPI|x\r`)).toBe(
      `${header}\rPID|1||12345\rZPI|x\r`,
    );
  });

  it("writes a message without segments as an empty string", () => {
    expect(stringify({ delimiters: standard, segments: [] })).toBe("");
  });

  it.each([
    ["line feeds", "\n"],
    ["carriage returns and line feeds", "\r\n"],
  ])("normalizes segments ended by %s", (_name, terminator) => {
    const input = [header, "PID|1", "ZPI|x"].join(terminator);
    expect(roundTrip(input)).toBe(`${header}\rPID|1\rZPI|x\r`);
  });

  it("removes framing, a byte order mark and blank lines", () => {
    const framed = `${byteOrderMark}\u000B${header}\r\r\nPID|1\r\u001C\r`;
    expect(roundTrip(framed)).toBe(`${header}\rPID|1\r`);
  });

  it("keeps empty fields, repetitions, components and subcomponents in the middle", () => {
    const body = "PID|1||a~~b|^x^&y&&z|";
    expect(roundTrip(`${header}\r${body}\r`)).toBe(
      `${header}\rPID|1||a~~b|^x^&y&&z\r`,
    );
  });

  it("drops the trailing delimiters the parser trims", () => {
    expect(roundTrip(`${header}\rPID|1|||a^b^^|c~~|&&\r`)).toBe(
      `${header}\rPID|1|||a^b|c\r`,
    );
  });

  it("keeps Z segments and unknown segments in order", () => {
    const input = `${header}\rZPI|1|x^y\rPID|1\rZZZ|\rXYZ|a~b\r`;
    expect(roundTrip(input)).toBe(
      `${header}\rZPI|1|x^y\rPID|1\rZZZ\rXYZ|a~b\r`,
    );
  });

  describe("null and empty", () => {
    it("writes the HL7 null as two quotes", () => {
      expect(roundTrip(`${header}\rPID|1|""|a^""^b|a&""\r`)).toBe(
        `${header}\rPID|1|""|a^""^b|a&""\r`,
      );
    });

    it("writes an empty field as nothing, so it stays distinct from the null", () => {
      expect(roundTrip(`${header}\rPID|1||""|\r`)).toBe(
        `${header}\rPID|1||""\r`,
      );
    });

    it("keeps a value of two quotes apart from the null", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH", "|", "^~\\&"), segment("NTE", '""')],
      };
      const text = stringify(message);
      expect(text).toBe(`MSH|^~\\&\rNTE|\\X22\\"\r`);
      expect(roundTrip(text)).toBe(text);
    });
  });

  describe("escaping", () => {
    it.each([
      ["a|b", "a\\F\\b"],
      ["a^b", "a\\S\\b"],
      ["a~b", "a\\R\\b"],
      ["a\\b", "a\\E\\b"],
      ["a&b", "a\\T\\b"],
      ["two\nlines", "two\\.br\\lines"],
      ["a\rb", "a\\X0D\\b"],
    ])("writes the value %j as %j", (value, written) => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH", "|", "^~\\&"), segment("NTE", "1", value)],
      };
      expect(stringify(message)).toBe(`MSH|^~\\&\rNTE|1|${written}\r`);
    });

    it("writes decoded escape sequences in their delimiter form", () => {
      const input = `${header}\rNTE|1|a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f\\X41\\\r`;
      expect(roundTrip(input)).toBe(
        `${header}\rNTE|1|a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\fA\r`,
      );
    });

    it("drops formatting commands that the parser removed", () => {
      expect(roundTrip(`${header}\rNTE|1|\\H\\bold\\N\\ text\r`)).toBe(
        `${header}\rNTE|1|bold text\r`,
      );
    });

    it("writes a value that consisted of removed commands as an empty subcomponent", () => {
      expect(roundTrip(`${header}\rNTE|1|\\H\\^x\r`)).toBe(
        `${header}\rNTE|1|^x\r`,
      );
    });

    it("writes line breaks as text commands", () => {
      expect(roundTrip(`${header}\rNTE|1|a\\.br\\b\\.sp\\c\r`)).toBe(
        `${header}\rNTE|1|a\\.br\\b\\.br\\c\r`,
      );
    });

    it("writes sequences it cannot interpret as the literal text they were kept as", () => {
      const rewritten = roundTrip(`${header}\rNTE|1|\\Zxyz\\ kept\r`);
      expect(rewritten).toBe(`${header}\rNTE|1|\\E\\Zxyz\\E\\ kept\r`);
      // Reading it again gives the same value, so nothing is lost.
      expect(stringify(parsed(rewritten).message)).toBe(rewritten);
    });
  });

  describe("MSH", () => {
    it("writes MSH-1 and MSH-2 as they are and never escapes them", () => {
      expect(roundTrip(`${header}\r`)).toBe(`${header}\r`);
    });

    it("keeps a shortened MSH-2 as written", () => {
      const input = "MSH|^~\\|LAB\r";
      expect(roundTrip(input)).toBe(input);
    });

    it("keeps the truncation character declared in MSH-2", () => {
      const input = "MSH|^~\\&#|LAB|||||||||2.7\rPID|1|a\\P\\b\r";
      expect(roundTrip(input)).toBe(input);
    });

    it("escapes the repeated delimiters in the other MSH fields", () => {
      const input = `${header}|a\\F\\b\\R\\c\r`;
      expect(roundTrip(input)).toBe(`${header}|a\\F\\b\\R\\c\r`);
    });

    it("writes the delimiters when a hand-built MSH lacks its first two fields", () => {
      const message: Hl7Message = {
        delimiters: { ...standard, truncation: "#" },
        segments: [segment("MSH"), segment("PID", "a|b")],
      };
      expect(stringify(message)).toBe("MSH|^~\\&#\rPID|a\\F\\b\r");
    });

    it("writes the delimiters of the message when MSH-1 and MSH-2 are empty", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH", "", ""), segment("PID", "1")],
      };
      expect(stringify(message)).toBe("MSH|^~\\&\rPID|1\r");
    });
  });

  describe("custom delimiters", () => {
    const custom = "MSH#$*!%#LAB#HOSP\rPID#1#a$b%c*d\\e\r";

    it("separates and escapes with the delimiters of the message", () => {
      expect(roundTrip(custom)).toBe(custom);
    });

    it("escapes the delimiters of the message but not the standard ones", () => {
      const input = "MSH#$*!%#LAB\rPID#1#a!F!b|c^d!S!e\r";
      expect(roundTrip(input)).toBe(input);
    });

    it("writes the truncation character as an escape sequence", () => {
      const input = "MSH#$*!%?#LAB#########2.8.2\rPID#1#a!P!b\r";
      expect(roundTrip(input)).toBe(input);
    });
  });
});
