import { describe, expect, it } from "vitest";

import type {
  Component,
  Delimiters,
  Field,
  Hl7Message,
  Segment,
} from "../../src/hl7v2/model";
import { stringify } from "../../src/hl7v2/stringify";
import { parsed, stringified, withoutSpans } from "./helpers";

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
  return stringified(parsed(input).message);
}

// Written as an escape so that editors and formatters cannot drop the invisible character.
const byteOrderMark = String.fromCodePoint(0xfeff);

const noSpan = { start: 0, end: 0 };

/** A segment built by hand: every value is a one-subcomponent field, `null` and `""` map to the other kinds. */
function segment(id: string, ...fields: (string | null)[]): Segment {
  return { id, span: noSpan, fields: fields.map(field) };
}

/** A field built by hand: a value in one subcomponent, `null` for the HL7 null, `""` for an empty field. */
function field(text: string | null): Field {
  return {
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
  };
}

/** A field of one repetition with two components, each holding one value. */
function twoComponents(first: string, second: string): Field {
  const component = (value: string): Component => ({
    span: noSpan,
    subcomponents: [{ kind: "value", value, span: noSpan }],
  });
  return {
    span: noSpan,
    repetitions: [
      { span: noSpan, components: [component(first), component(second)] },
    ],
  };
}

/** An array with a hole between its two elements, as `[first, , second]` writes it. */
function withHole(first: unknown, second: unknown): unknown[] {
  const list: unknown[] = [first];
  list[2] = second;
  return list;
}

describe("stringify", () => {
  it("ends every segment, the last one included, with a carriage return", () => {
    expect(roundTrip(`${header}\rPID|1||12345\rZPI|x\r`)).toBe(
      `${header}\rPID|1||12345\rZPI|x\r`,
    );
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
      const text = stringified(message);
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
      ["two\nlines", "two\\X0A\\lines"],
      ["a\rb", "a\\X0D\\b"],
    ])("writes the value %j as %j", (value, written) => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH", "|", "^~\\&"), segment("NTE", "1", value)],
      };
      expect(stringified(message)).toBe(`MSH|^~\\&\rNTE|1|${written}\r`);
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

    it("writes line breaks as hexadecimal escapes, which every text data type allows", () => {
      expect(roundTrip(`${header}\rNTE|1|a\\.br\\b\\.sp\\c\r`)).toBe(
        `${header}\rNTE|1|a\\X0A\\b\\X0A\\c\r`,
      );
    });

    it("writes sequences it cannot interpret as the literal text they were kept as", () => {
      const rewritten = roundTrip(`${header}\rNTE|1|\\Zxyz\\ kept\r`);
      expect(rewritten).toBe(`${header}\rNTE|1|\\E\\Zxyz\\E\\ kept\r`);
      // Reading it again gives the same value, so nothing is lost.
      expect(stringified(parsed(rewritten).message)).toBe(rewritten);
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
        delimiters: standard,
        segments: [segment("MSH"), segment("PID", "a|b")],
      };
      expect(stringified(message)).toBe("MSH|^~\\&\rPID|a\\F\\b\r");
    });

    it("writes a truncation character from the delimiters when the version allows one", () => {
      const message: Hl7Message = {
        delimiters: { ...standard, truncation: "#" },
        version: "2.7",
        segments: [
          segment("MSH", "", "", ...Array<string>(9).fill(""), "2.7"),
          segment("PID", "a#"),
        ],
      };
      const text = stringified(message);
      expect(text).toBe("MSH|^~\\&#||||||||||2.7\rPID|a\\P\\\r");
      expect(roundTrip(text)).toBe(text);
    });

    it("writes the delimiters of the message when MSH-1 and MSH-2 are empty", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH", "", ""), segment("PID", "1")],
      };
      expect(stringified(message)).toBe("MSH|^~\\&\rPID|1\r");
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

    it("writes a truncated value with the truncation character after it", () => {
      const input = "MSH#$*!%?#LAB#########2.8.2\rPID#1#a!P!b?$?\r";
      expect(roundTrip(input)).toBe(input);
    });

    it("writes the truncation character as an escape sequence", () => {
      const input = "MSH#$*!%?#LAB#########2.8.2\rPID#1#a!P!b\r";
      expect(roundTrip(input)).toBe(input);
    });
  });

  describe("omitted encoding characters", () => {
    it.each([
      ["no escape character", "MSH|^~|LAB\rPID|a&b\\c^d\r"],
      ["no subcomponent separator", "MSH|^~\\|LAB\rPID|a&b\\F\\c^d\r"],
    ])("writes a message with %s as it reads it", (_description, input) => {
      expect(roundTrip(input)).toBe(input);
    });
  });

  describe("trees the delimiters cannot express", () => {
    const withoutEscape: Delimiters = {
      field: "|",
      component: "^",
      repetition: "~",
    };
    const header = segment("MSH", "|", "^~");

    it.each(["a|b", "a^b", "a~b", "a\rb", '""'])(
      "fails for the value %j without an escape character",
      (value) => {
        const message: Hl7Message = {
          delimiters: withoutEscape,
          segments: [header, segment("NTE", "1", value)],
        };
        expect(stringify(message)).toStrictEqual({
          ok: false,
          error: {
            code: "ESCAPE_CHARACTER_REQUIRED",
            message: expect.any(String) as string,
            location: {
              span: noSpan,
              segmentIndex: 1,
              segmentId: "NTE",
              field: 2,
              repetition: 1,
              component: 1,
              subcomponent: 1,
            },
          },
        });
      },
    );

    it("fails for several subcomponents without a subcomponent separator", () => {
      const value = { kind: "value", value: "a", span: noSpan } as const;
      const message: Hl7Message = {
        delimiters: withoutEscape,
        segments: [
          header,
          {
            id: "pid",
            span: noSpan,
            fields: [
              {
                span: noSpan,
                repetitions: [
                  {
                    span: noSpan,
                    components: [
                      {
                        span: { start: 7, end: 9 },
                        subcomponents: [value, value],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "SUBCOMPONENT_SEPARATOR_REQUIRED",
          // The identifier is invalid, so the location leaves it out.
          location: {
            span: { start: 7, end: 9 },
            segmentIndex: 1,
            field: 1,
            repetition: 1,
            component: 1,
          },
        },
      });
    });

    it("fails for a truncated value without a truncation character", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [
          segment("MSH", "|", "^~\\&"),
          {
            id: "NTE",
            span: noSpan,
            fields: [
              {
                span: noSpan,
                repetitions: [
                  {
                    span: noSpan,
                    components: [
                      {
                        span: noSpan,
                        subcomponents: [
                          {
                            kind: "value",
                            value: "cut",
                            truncated: true,
                            span: noSpan,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "TRUNCATION_CHARACTER_REQUIRED",
          location: { field: 1 },
        },
      });
    });

    it("fails for the HL7 null when the quote is a delimiter", () => {
      const message: Hl7Message = {
        delimiters: { ...standard, repetition: '"' },
        segments: [segment("MSH", "|", '^"\\&'), segment("PID", "1", null)],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: { code: "NULL_NOT_REPRESENTABLE", location: { field: 2 } },
      });
    });

    it("reports the first node that cannot be written", () => {
      const message: Hl7Message = {
        delimiters: withoutEscape,
        segments: [header, segment("NTE", "a|b", "c^d"), segment("ZZZ", "~")],
      };
      const result = stringify(message);
      expect(result.ok || result.error.location).toMatchObject({
        segmentIndex: 1,
        field: 1,
      });
    });

    it("writes a line feed as it is, where it reads back as data", () => {
      const message: Hl7Message = {
        delimiters: withoutEscape,
        segments: [header, segment("NTE", "two\nlines")],
      };
      const text = stringified(message);
      expect(text).toBe("MSH|^~\rNTE|two\nlines\r");
      expect(roundTrip(text)).toBe(text);
    });

    it("fails for a line feed in MSH, where it would end the segment", () => {
      const message: Hl7Message = {
        delimiters: withoutEscape,
        segments: [segment("MSH", "|", "^~", "two\nlines")],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "ESCAPE_CHARACTER_REQUIRED",
          location: { segmentId: "MSH", field: 3 },
        },
      });
    });

    it("never escapes MSH-1 and MSH-2, so they need no escape character", () => {
      const message: Hl7Message = {
        delimiters: withoutEscape,
        segments: [header],
      };
      expect(stringify(message)).toStrictEqual({ ok: true, value: "MSH|^~\r" });
    });
  });

  describe("trees that do not have the shape of a message", () => {
    const msh = segment("MSH", "|", "^~\\&");
    const pid = segment("PID", "1", "a");

    /** Writes a tree that the types do not allow, as plain JavaScript callers can pass one. */
    function write(tree: unknown) {
      return stringify(tree as Hl7Message);
    }

    /** The PID segment with one node replaced by `node`, at fields[1] and below as `path` says. */
    function pidWith(path: readonly (string | number)[], node: unknown) {
      const copy = structuredClone(pid) as unknown as Record<string, unknown>;
      let parent: Record<string | number, unknown> = copy;
      for (const key of path.slice(0, -1)) {
        parent = parent[key] as Record<string | number, unknown>;
      }
      parent[path.at(-1) ?? ""] = node;
      return { delimiters: standard, segments: [msh, copy] };
    }

    it.each([undefined, null, 42, "MSH|^~\\&"])(
      "fails for the message %j",
      (tree) => {
        expect(write(tree)).toStrictEqual({
          ok: false,
          error: {
            code: "INVALID_TREE",
            message: expect.any(String) as string,
            location: { span: noSpan },
          },
        });
      },
    );

    it.each([
      [
        "segments that are not an array",
        { delimiters: standard, segments: {} },
      ],
      [
        "a version that is not a string",
        { delimiters: standard, version: 2.5, segments: [msh] },
      ],
    ])("fails for %s", (_name, tree) => {
      expect(write(tree)).toMatchObject({
        ok: false,
        error: { code: "INVALID_TREE", location: { span: noSpan } },
      });
    });

    it.each([
      // A hole in an array, which `every` and `forEach` skip.
      ["a hole in the segments", withHole(msh, pid), { segmentIndex: 1 }],
      ["a null segment", [msh, null], { segmentIndex: 1 }],
      [
        "an identifier that is not a string",
        [msh, { ...pid, id: 7 }],
        { segmentIndex: 1 },
      ],
      [
        "fields that are not an array",
        [msh, { ...pid, fields: "a" }],
        { segmentIndex: 1 },
      ],
    ])("fails for %s", (_name, segments, location) => {
      expect(write({ delimiters: standard, segments })).toMatchObject({
        ok: false,
        error: { code: "INVALID_TREE", location },
      });
    });

    it.each<[string, (string | number)[], unknown, object]>([
      ["a missing field", ["fields", 1], undefined, { field: 2 }],
      [
        "repetitions that are not an array",
        ["fields", 1, "repetitions"],
        null,
        { field: 2 },
      ],
      [
        "a null repetition",
        ["fields", 1, "repetitions", 0],
        null,
        { field: 2, repetition: 1 },
      ],
      [
        "a component without subcomponents",
        ["fields", 1, "repetitions", 0, "components", 0],
        { span: noSpan },
        { field: 2, repetition: 1, component: 1 },
      ],
      [
        "a subcomponent of unknown kind",
        ["fields", 1, "repetitions", 0, "components", 0, "subcomponents", 0],
        { kind: "text", span: noSpan },
        { field: 2, subcomponent: 1 },
      ],
      [
        "a value that is not a string",
        [
          "fields",
          1,
          "repetitions",
          0,
          "components",
          0,
          "subcomponents",
          0,
          "value",
        ],
        5,
        { field: 2, subcomponent: 1 },
      ],
      [
        "a truncation flag that is false",
        [
          "fields",
          1,
          "repetitions",
          0,
          "components",
          0,
          "subcomponents",
          0,
          "truncated",
        ],
        false,
        { field: 2, subcomponent: 1 },
      ],
    ])("fails for %s, located at the node", (_name, path, node, location) => {
      expect(write(pidWith(path, node))).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_TREE",
          location: { segmentIndex: 1, segmentId: "PID", ...location },
        },
      });
    });

    it("locates a failure with the span the tree gives the node, or its parent's", () => {
      const located = pidWith(
        ["fields", 1, "repetitions", 0, "components", 0, "subcomponents", 0],
        5,
      );
      const [, segment] = located.segments as [unknown, Segment];
      const withSpans = {
        ...located,
        segments: [msh, { ...segment, span: { start: 10, end: 20 } }],
      };
      // The field of the hand-built segment has no usable span of its own below the segment, so its own (empty) one
      // is used; a span that is not a range falls back to the parent.
      expect(write(withSpans)).toMatchObject({
        error: { location: { span: noSpan } },
      });
      const broken = { ...segment, fields: null, span: { start: 4, end: 2 } };
      expect(
        write({ delimiters: standard, segments: [msh, broken] }),
      ).toMatchObject({
        error: {
          code: "INVALID_TREE",
          location: { span: noSpan, segmentIndex: 1 },
        },
      });
    });

    it("writes a tree without spans", () => {
      const tree = JSON.parse(
        JSON.stringify(
          { delimiters: standard, segments: [msh, pid] },
          (key, value: unknown) => (key === "span" ? undefined : value),
        ),
      ) as unknown;
      expect(write(tree)).toStrictEqual({
        ok: true,
        value: "MSH|^~\\&\rPID|1|a\r",
      });
    });
  });

  describe("delimiters that cannot be declared", () => {
    const pid = segment("PID", "1");

    it.each<[string, unknown]>([
      ["missing", undefined],
      ["an empty field separator", { ...standard, field: "" }],
      ["two characters", { ...standard, component: "^^" }],
      ["a letter", { ...standard, repetition: "x" }],
      ["a digit", { ...standard, escape: "1" }],
      ["a carriage return", { ...standard, subcomponent: "\r" }],
      ["a space", { ...standard, field: " " }],
      ["a number", { ...standard, field: 124 }],
      ["two equal ones", { ...standard, subcomponent: "^" }],
      [
        "a subcomponent separator without escape character",
        { field: "|", component: "^", repetition: "~", subcomponent: "&" },
      ],
      [
        "a truncation character without subcomponent separator",
        {
          field: "|",
          component: "^",
          repetition: "~",
          escape: "\\",
          truncation: "#",
        },
      ],
      ["no repetition separator", { field: "|", component: "^" }],
    ])("fails for %s", (_name, delimiters) => {
      const message = { delimiters, segments: [segment("MSH"), pid] };
      expect(stringify(message as Hl7Message)).toMatchObject({
        ok: false,
        error: { code: "INVALID_DELIMITERS", location: { span: noSpan } },
      });
    });
  });

  describe("segments", () => {
    it.each<[string, Segment[], object]>([
      ["no segment", [], { span: noSpan }],
      [
        "a first segment other than MSH",
        [segment("PID", "1"), segment("MSH")],
        { segmentIndex: 0 },
      ],
    ])("fails with MISSING_MSH for %s", (_name, segments, location) => {
      expect(stringify({ delimiters: standard, segments })).toStrictEqual({
        ok: false,
        error: {
          code: "MISSING_MSH",
          message: expect.any(String) as string,
          location: { span: noSpan, ...location },
        },
      });
    });

    it.each(["P|D", "PI\rD"])(
      "fails for the identifier %j, which would not read back",
      (id) => {
        const message: Hl7Message = {
          delimiters: standard,
          segments: [segment("MSH"), segment(id, "1")],
        };
        expect(stringify(message)).toMatchObject({
          ok: false,
          error: {
            code: "INVALID_SEGMENT_ID",
            location: { segmentIndex: 1 },
          },
        });
      },
    );

    it.each([
      ["a lower-case identifier", "pid|1", "pid|1"],
      ["an empty identifier", "|1", "|1"],
      ["a short identifier", "PI|1", "PI|1"],
      ["an empty identifier without fields", "|", "|"],
      ["an identifier that starts with a line feed", "\n|1", "\n|1"],
    ])("writes %s so that it reads back", (_name, written, rewritten) => {
      const input = `${header}\r\n${written}\r`;
      const { message } = parsed(input);
      const text = stringified(message);
      expect(text).toContain(rewritten);
      expect(withoutSpans(parsed(text).message)).toStrictEqual(
        withoutSpans(message),
      );
    });

    it.each([
      ["without identifier and fields", "", "MSH|^~\\&\r|\rPID|1\r"],
      ["with a blank identifier", " \t", "MSH|^~\\&\r \t|\rPID|1\r"],
    ])(
      "writes a hand-built segment %s with a field separator, so that it is no blank line",
      (_name, id, text) => {
        const message: Hl7Message = {
          delimiters: standard,
          segments: [segment("MSH"), segment(id), segment("PID", "1")],
        };
        expect(stringified(message)).toBe(text);
        const segments = parsed(text).message.segments.slice(1);
        expect(
          segments.map((node) => [node.id, node.fields.length]),
        ).toStrictEqual([
          [id, 0],
          ["PID", 1],
        ]);
      },
    );

    it("writes a hand-built blank last segment with a field separator, so that it is not trimmed", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH"), segment("  ")],
      };
      const text = stringified(message);
      expect(text).toBe("MSH|^~\\&\r  |\r");
      expect(parsed(text).message.segments[1]?.id).toBe("  ");
    });
  });

  describe("MLLP characters in values", () => {
    it.each([
      ["at the end of the message", `${header}\rNTE|a\u001C`],
      ["before trailing spaces", `${header}\rNTE|a\u001C \t`],
      ["at the end of MSH", "MSH|^~\\&|LAB\u001C"],
      ["as a whole component", "MSH|^~\\&|XP.\u001C^"],
    ])("keeps an end block %s", (_name, input) => {
      // The end block of the input itself is framing; the one before it is content.
      const { message } = parsed(`${input}\u001C\r`);
      const text = stringified(message);
      expect(withoutSpans(parsed(text).message)).toStrictEqual(
        withoutSpans(message),
      );
    });

    it("writes an end block inside a segment as it is", () => {
      expect(roundTrip(`${header}\rNTE|a\u001Cb\rNTE|c\r`)).toBe(
        `${header}\rNTE|a\u001Cb\rNTE|c\r`,
      );
    });
  });

  describe("MSH-1, MSH-2 and the version", () => {
    it.each<[string, Segment]>([
      ["another field separator in MSH-1", segment("MSH", "#", "^~\\&")],
      ["two characters in MSH-1", segment("MSH", "||", "^~\\&")],
      ["the null in MSH-1", segment("MSH", null, "^~\\&")],
    ])("fails for %s", (_name, msh) => {
      expect(
        stringify({ delimiters: standard, segments: [msh] }),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DELIMITERS_MISMATCH",
          location: { segmentIndex: 0, segmentId: "MSH", field: 1 },
        },
      });
    });

    it.each<[string, Segment]>([
      ["another field separator in MSH-1", segment("MSH", "#", "^~\\&")],
      ["two characters in MSH-1", segment("MSH", "||", "^~\\&")],
      ["the null in MSH-1", segment("MSH", null, "^~\\&")],
    ])("fails for %s", (_name, msh) => {
      expect(
        stringify({ delimiters: standard, segments: [msh] }),
      ).toMatchObject({
        ok: false,
        error: {
          code: "DELIMITERS_MISMATCH",
          location: { segmentIndex: 0, segmentId: "MSH", field: 1 },
        },
      });
    });

    it.each<[string, Segment]>([
      ["other encoding characters", segment("MSH", "|", "^~\\#")],
      ["omitted encoding characters", segment("MSH", "|", "^~")],
      ["the field separator in MSH-2", segment("MSH", "|", "^~\\&|")],
      [
        "a truncation character before version 2.7",
        segment("MSH", "|", "^~\\&#"),
      ],
      [
        "MSH-2 in two components",
        { ...segment("MSH"), fields: [field("|"), twoComponents("^~", "\\&")] },
      ],
    ])("fails for %s", (_name, msh) => {
      const delimiters =
        msh.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0];
      const truncation =
        delimiters?.kind === "value" && delimiters.value.endsWith("#");
      const message: Hl7Message = {
        delimiters: truncation ? { ...standard, truncation: "#" } : standard,
        segments: [msh],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "DELIMITERS_MISMATCH",
          location: { segmentIndex: 0, segmentId: "MSH", field: 2 },
        },
      });
    });

    it("writes an MSH-2 whose fifth character the version makes no truncation character", () => {
      const input = "MSH|^~\\&#|LAB||||||||2.5.1\rPID|a#\r";
      const { message } = parsed(input);
      expect(message.delimiters.truncation).toBeUndefined();
      expect(stringified(message)).toBe(input);
    });

    it.each([
      [
        "a version hidden from the truncation rule",
        "MSH|^~\\&#||||||||||\\H\\2.7\rPID|a#",
        "DELIMITERS_MISMATCH",
      ],
      [
        "a value of two quotes without hex escapes",
        `MSH|^~\\&${"|".repeat(16)}UNICODE\rNTE|"\\H\\"`,
        "HEX_ESCAPE_UNSUPPORTED",
      ],
    ])(
      "fails for the tree parse returns for %s, as documented",
      (_name, input, code) => {
        expect(stringify(parsed(input).message)).toMatchObject({
          ok: false,
          error: { code },
        });
      },
    );

    it("fails when a later MSH-2 cannot be written as it is", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [segment("MSH"), segment("MSH", "|", "^~|&")],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "DELIMITERS_MISMATCH",
          location: { segmentIndex: 1, field: 2 },
        },
      });
    });

    it("writes a later MSH as parse keeps it, with its own MSH-2", () => {
      const input = `${header}\rMSH|#$|x\rMSH|\rMSH\r`;
      const { message } = parsed(input);
      expect(stringified(message)).toBe(input);
    });

    it.each<[string, string | undefined, string]>([
      ["a version without MSH-12", "2.5.1", ""],
      ["no version with MSH-12", undefined, "2.5.1"],
      ["another version", "2.4", "2.5.1"],
    ])("fails for %s", (_name, version, msh12) => {
      const message: Hl7Message = {
        delimiters: standard,
        ...(version === undefined ? {} : { version }),
        segments: [
          segment("MSH", "|", "^~\\&", ...Array<string>(9).fill(""), msh12),
        ],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "VERSION_MISMATCH",
          location: { segmentIndex: 0, segmentId: "MSH", field: 12 },
        },
      });
    });
  });

  describe("character sets", () => {
    const withCharset = (charset: string, value: string): Hl7Message => ({
      delimiters: standard,
      segments: [
        segment("MSH", "|", "^~\\&", ...Array<string>(15).fill(""), charset),
        segment("NTE", value),
      ],
    });

    it.each([
      "ASCII",
      "8859/2",
      "ISO IR87",
      "GB 18030-2000",
      "BIG-5",
      "UNICODE UTF-8",
    ])("writes hexadecimal escapes in %s, where they read back", (charset) => {
      const message = withCharset(charset, "a\r\nb");
      const text = stringified(message);
      expect(text).toContain("NTE|a\\X0D\\\\X0A\\b\r");
      expect(withoutSpans(parsed(text).message)).toStrictEqual(
        withoutSpans(message),
      );
    });

    it.each(["UNICODE", "UNICODE UTF-16", "UNICODE UTF-32", "KLINGON"])(
      "writes a line feed as a line break command in %s",
      (charset) => {
        const message = withCharset(charset, "a\nb");
        const text = stringified(message);
        expect(text).toContain("NTE|a\\.br\\b\r");
        expect(withoutSpans(parsed(text).message)).toStrictEqual(
          withoutSpans(message),
        );
      },
    );

    it.each(["a\rb", '""'])(
      "fails for the value %j in a character set without hexadecimal escapes",
      (value) => {
        expect(stringify(withCharset("UNICODE UTF-16", value))).toMatchObject({
          ok: false,
          error: {
            code: "HEX_ESCAPE_UNSUPPORTED",
            location: { segmentIndex: 1, segmentId: "NTE", field: 1 },
          },
        });
      },
    );

    it("fails for a line feed when the period is a delimiter, because the line break command would split", () => {
      const message: Hl7Message = {
        delimiters: { ...standard, component: "." },
        segments: [
          segment(
            "MSH",
            "|",
            ".~\\&",
            ...Array<string>(15).fill(""),
            "UNICODE UTF-16",
          ),
          segment("NTE", "a\nb"),
        ],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "HEX_ESCAPE_UNSUPPORTED",
          location: { segmentIndex: 1, segmentId: "NTE", field: 1 },
        },
      });
    });

    it("writes MSH itself without hexadecimal escapes when MSH-18 declares a set without them", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [
          segment(
            "MSH",
            "|",
            "^~\\&",
            "a\nb",
            ...Array<string>(14).fill(""),
            "UNICODE",
          ),
        ],
      };
      expect(stringified(message)).toBe(
        `MSH|^~\\&|a\\.br\\b${"|".repeat(15)}UNICODE\r`,
      );
    });

    it("fails for a carriage return in MSH when MSH-18 declares a set without hexadecimal escapes", () => {
      const message: Hl7Message = {
        delimiters: standard,
        segments: [
          segment(
            "MSH",
            "|",
            "^~\\&",
            "a\rb",
            ...Array<string>(14).fill(""),
            "UNICODE",
          ),
        ],
      };
      expect(stringify(message)).toMatchObject({
        ok: false,
        error: {
          code: "HEX_ESCAPE_UNSUPPORTED",
          location: { segmentIndex: 0, field: 3 },
        },
      });
    });
  });

  describe("empty nodes", () => {
    it("drops empty nodes at the end of every list, as parse does", () => {
      const empty = { kind: "empty", span: noSpan } as const;
      const blank = { kind: "value", value: "", span: noSpan } as const;
      const message: Hl7Message = {
        delimiters: standard,
        segments: [
          segment("MSH"),
          {
            id: "PID",
            span: noSpan,
            fields: [
              field("a"),
              {
                span: noSpan,
                repetitions: [
                  {
                    span: noSpan,
                    components: [
                      { span: noSpan, subcomponents: [blank, empty] },
                    ],
                  },
                  { span: noSpan, components: [] },
                ],
              },
            ],
          },
        ],
      };
      expect(stringified(message)).toBe("MSH|^~\\&\rPID|a\r");
    });

    it("writes a value emptied by formatting commands as an empty subcomponent", () => {
      const { message } = parsed(`${header}\rNTE|\\H\\&x\r`);
      expect(stringified(message)).toBe(`${header}\rNTE|&x\r`);
    });

    it("writes only the first subcomponent without a separator when the others are empty", () => {
      const empty = { kind: "empty", span: noSpan } as const;
      const message: Hl7Message = {
        delimiters: { field: "|", component: "^", repetition: "~" },
        segments: [
          segment("MSH", "|", "^~"),
          {
            id: "NTE",
            span: noSpan,
            fields: [
              {
                span: noSpan,
                repetitions: [
                  {
                    span: noSpan,
                    components: [
                      {
                        span: noSpan,
                        subcomponents: [
                          { kind: "value", value: "a", span: noSpan },
                          empty,
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(stringified(message)).toBe("MSH|^~\rNTE|a\r");
    });
  });

  it("fails instead of throwing when the text exceeds the longest string", () => {
    // Four references to one string of 2^27 characters exceed the maximum string length of V8 (2^29 - 24) only
    // when joined, without allocating more than the one string.
    const long = "a".repeat(2 ** 27);
    const message: Hl7Message = {
      delimiters: standard,
      segments: [segment("MSH"), segment("NTE", long, long, long, long)],
    };
    expect(stringify(message)).toStrictEqual({
      ok: false,
      error: {
        code: "OUTPUT_TOO_LARGE",
        message: expect.any(String) as string,
        location: { span: noSpan },
      },
    });
  });

  it("fails instead of throwing when MSH alone exceeds the longest string", () => {
    const long = "a".repeat(2 ** 27);
    const message: Hl7Message = {
      delimiters: standard,
      segments: [segment("MSH", "|", "^~\\&", long, long, long, long)],
    };
    expect(stringify(message)).toMatchObject({
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE" },
    });
  });

  it("never puts message content into a failure message", () => {
    const message: Hl7Message = {
      delimiters: { field: "|", component: "^", repetition: "~" },
      segments: [segment("MSH", "|", "^~"), segment("NTE", "Everyman|Adam")],
    };
    const result = stringify(message);
    expect(result.ok || result.error.message).not.toContain("Everyman");
  });
});
