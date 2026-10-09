import { describe, expect, it } from "vitest";

import { parse } from "../../src/hl7v2/parse";
import type { IssueCode } from "../../src/shared/issue";
import { fieldShape, parsed, segmentShape } from "./helpers";

const msh =
  "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20240115103000||ADT^A01^ADT_A01|MSG00001|P|2.5.1";

/** A message of the given segments after the standard MSH, joined with carriage returns. */
function message(...segments: string[]): string {
  return [msh, ...segments].join("\r");
}

function codes(input: string): IssueCode[] {
  return parsed(input).issues.map(({ code }) => code);
}

describe("parse", () => {
  describe("message", () => {
    it("reads the delimiters, the version and every segment in order", () => {
      const { message: parsedMessage, issues } = parsed(
        message("EVN|A01", "PID|1", "ZPI|custom", "PV1|1|I"),
      );
      expect(issues).toStrictEqual([]);
      expect(parsedMessage.delimiters).toStrictEqual({
        field: "|",
        component: "^",
        repetition: "~",
        escape: "\\",
        subcomponent: "&",
      });
      expect(parsedMessage.version).toBe("2.5.1");
      expect(parsedMessage.segments.map(({ id }) => id)).toStrictEqual([
        "MSH",
        "EVN",
        "PID",
        "ZPI",
        "PV1",
      ]);
    });

    it("omits the version when MSH-12 is empty", () => {
      const result = parsed("MSH|^~\\&|LAB");
      expect(result.message).not.toHaveProperty("version");
    });

    it("gives every segment the span of its text without terminator", () => {
      const input = message("PID|1", "PV1|1");
      const spans = parsed(input).message.segments.map(({ span }) =>
        input.slice(span.start, span.end),
      );
      expect(spans).toStrictEqual([msh, "PID|1", "PV1|1"]);
    });
  });

  describe("MSH", () => {
    const { message: header } = parsed(message());
    const segment = header.segments[0];

    it("has MSH-1, the field separator, as fields[0]", () => {
      expect(fieldShape(segment?.fields[0])).toStrictEqual([[["|"]]]);
      expect(segment?.fields[0]?.span).toStrictEqual({ start: 3, end: 4 });
    });

    it("has MSH-2, the encoding characters, as fields[1], neither split nor unescaped", () => {
      expect(fieldShape(segment?.fields[1])).toStrictEqual([[["^~\\&"]]]);
      expect(segment?.fields[1]?.span).toStrictEqual({ start: 4, end: 8 });
    });

    it("numbers the other fields like every segment: MSH-n is fields[n - 1]", () => {
      expect(fieldShape(segment?.fields[3 - 1])).toStrictEqual([[["LAB"]]]);
      expect(fieldShape(segment?.fields[9 - 1])).toStrictEqual([
        [["ADT"], ["A01"], ["ADT_A01"]],
      ]);
      expect(fieldShape(segment?.fields[12 - 1])).toStrictEqual([[["2.5.1"]]]);
      expect(segment?.fields).toHaveLength(12);
    });

    it("treats MSH-1 and MSH-2 of a later MSH segment the same way", () => {
      const later = parsed(message("PID|1", msh)).message.segments[2];
      expect(segmentShape(later)?.slice(0, 3)).toStrictEqual([
        [[["|"]]],
        [[["^~\\&"]]],
        [[["LAB"]]],
      ]);
    });

    it("keeps an empty MSH-2 of a later MSH segment empty", () => {
      const later = parsed(message("MSH||LAB")).message.segments[1];
      expect(segmentShape(later)).toStrictEqual([[[["|"]]], [], [[["LAB"]]]]);
    });

    it("parses an MSH segment that ends after MSH-2", () => {
      const only = parsed("MSH|^~\\&").message.segments[0];
      expect(segmentShape(only)).toStrictEqual([[[["|"]]], [[["^~\\&"]]]]);
    });
  });

  describe("fields", () => {
    it("numbers fields from 1: SEG-n is fields[n - 1]", () => {
      const pid = parsed(message("PID|1||12345||Everyman^Adam")).message
        .segments[1];
      expect(fieldShape(pid?.fields[1 - 1])).toStrictEqual([[["1"]]]);
      expect(fieldShape(pid?.fields[3 - 1])).toStrictEqual([[["12345"]]]);
      expect(fieldShape(pid?.fields[5 - 1])).toStrictEqual([
        [["Everyman"], ["Adam"]],
      ]);
    });

    it.each([
      ["a plain value", "a", [[["a"]]]],
      ["components", "a^b^c", [[["a"], ["b"], ["c"]]]],
      ["repetitions", "a~b", [[["a"]], [["b"]]]],
      ["subcomponents", "a&b^c", [[["a", "b"], ["c"]]]],
      [
        "all levels",
        "a&b^c~d^e&f",
        [
          [["a", "b"], ["c"]],
          [["d"], ["e", "f"]],
        ],
      ],
      ["the HL7 null", '""', [[[null]]]],
      ["a null component", 'a^""', [[["a"], [null]]]],
      ["a null subcomponent", 'a&""', [[["a", null]]]],
      ["quotes that are not the HL7 null", '"""', [[['"""']]]],
      ["an interior empty component", "a^^c", [[["a"], [], ["c"]]]],
      ["an interior empty subcomponent", "a&&c", [[["a", "", "c"]]]],
      ["a leading empty subcomponent", "&b", [[["", "b"]]]],
      ["an interior empty repetition", "a~~c", [[["a"]], [], [["c"]]]],
      ["trailing empty components", "a^^", [[["a"]]]],
      ["trailing empty subcomponents", "a&&", [[["a"]]]],
      ["trailing empty repetitions", "a~~", [[["a"]]]],
      ["trailing delimiters of mixed levels", "a~b^&^~", [[["a"]], [["b"]]]],
      ["an empty field", "", []],
      ["a field of delimiters only", "^~&", []],
    ])("models %s", (_description, raw, shape) => {
      const pid = parsed(message(`PID|${raw}|end`)).message.segments[1];
      expect(fieldShape(pid?.fields[0])).toStrictEqual(shape);
      expect(fieldShape(pid?.fields[1])).toStrictEqual([[["end"]]]);
    });

    it("drops trailing empty fields but keeps them in the segment span", () => {
      const input = message("PID|1||3|||");
      const pid = parsed(input).message.segments[1];
      expect(segmentShape(pid)).toStrictEqual([[[["1"]]], [], [[["3"]]]]);
      expect(pid && input.slice(pid.span.start, pid.span.end)).toBe(
        "PID|1||3|||",
      );
    });

    it("keeps the raw text of trimmed children in the parent span", () => {
      const input = message("PID|a^&^~|b");
      const field = parsed(input).message.segments[1]?.fields[0];
      expect(field && input.slice(field.span.start, field.span.end)).toBe(
        "a^&^~",
      );
      const repetition = field?.repetitions[0];
      expect(
        repetition && input.slice(repetition.span.start, repetition.span.end),
      ).toBe("a^&^");
    });

    it.each([
      ["a segment with only an identifier", "ZZZ"],
      ["a segment that ends with a field separator", "ZZZ|"],
      ["a segment of empty fields", "ZZZ|||"],
    ])("gives %s no fields", (_description, raw) => {
      const segment = parsed(message(raw)).message.segments[1];
      expect(segment?.id).toBe("ZZZ");
      expect(segment?.fields).toStrictEqual([]);
    });
  });

  describe("delimiters", () => {
    it("parses with the delimiters the message declares", () => {
      const input =
        "MSH#$*!%#LAB#HOSP#####ADT$A01#1#P#2.5.1\rPID#1##a$b*c$d%e##x!F!y!S!z";
      const { message: custom } = parsed(input);
      expect(custom.delimiters).toStrictEqual({
        field: "#",
        component: "$",
        repetition: "*",
        escape: "!",
        subcomponent: "%",
      });
      expect(segmentShape(custom.segments[1])).toStrictEqual([
        [[["1"]]],
        [],
        [
          [["a"], ["b"]],
          [["c"], ["d", "e"]],
        ],
        [],
        [[["x#y$z"]]],
      ]);
    });

    it("never splits on the truncation character", () => {
      const header = `MSH|^~\\&#${"|".repeat(10)}2.7`;
      const { message: truncated } = parsed(
        `${header}\rNTE|1||Long text#\\P\\`,
      );
      expect(truncated.delimiters.truncation).toBe("#");
      expect(fieldShape(truncated.segments[1]?.fields[2])).toStrictEqual([
        [["Long text##"]],
      ]);
    });

    it.each([
      ["the escape and subcomponent delimiters", "^~", [[["a&b\\F\\c"]]]],
      ["the subcomponent separator", "^~\\", [[["a&b|c"]]]],
    ])(
      "reports an MSH-2 without %s and does not use them",
      (_description, encoding, shape) => {
        const result = parsed(`MSH|${encoding}|LAB\rPID|a&b\\F\\c`);
        expect(result.issues.map(({ code }) => code)).toStrictEqual([
          "ENCODING_CHARACTERS_OMITTED",
        ]);
        expect(fieldShape(result.message.segments[1]?.fields[0])).toStrictEqual(
          shape,
        );
      },
    );
  });

  describe("escape sequences", () => {
    it("decodes values and keeps the raw text in the span", () => {
      const input = message("NTE|1||Line 1\\.br\\Line 2 \\T\\ more");
      const value =
        parsed(input).message.segments[1]?.fields[2]?.repetitions[0]
          ?.components[0]?.subcomponents[0];
      expect(value).toStrictEqual({
        kind: "value",
        value: "Line 1\nLine 2 & more",
        span: { start: msh.length + 8, end: input.length },
      });
    });

    it("reports issues at the exact position of the sequence", () => {
      const input = message("PID|1", "ZPI|a~b^c&x\\Zlocal\\y");
      const [issue] = parsed(input).issues;
      expect(issue).toStrictEqual({
        code: "LOCAL_ESCAPE_KEPT",
        severity: "warning",
        message: expect.any(String) as string,
        location: {
          span: {
            start: input.indexOf("\\Z"),
            end: input.indexOf("\\Z") + "\\Zlocal\\".length,
          },
          segmentIndex: 2,
          segmentId: "ZPI",
          field: 1,
          repetition: 2,
          component: 2,
          subcomponent: 2,
        },
        value: "\\Zlocal\\",
      });
    });

    it("reports issues in MSH fields after MSH-2 with their field number", () => {
      const result = parsed("MSH|^~\\&|LAB\\Q\\");
      expect(result.issues[0]?.location).toMatchObject({
        segmentId: "MSH",
        field: 3,
      });
    });

    it.each([
      ["UNICODE UTF-8", "\\XC3A9\\", "é", []],
      ["8859/1", "\\XE9\\", "é", []],
      ["", "\\X41\\", "A", []],
      ["UNICODE", "\\X41\\", "\\X41\\", ["UNSUPPORTED_CHARACTER_SET"]],
    ])(
      "decodes hexadecimal escapes with MSH-18 %j",
      (charset, raw, value, issueCodes) => {
        const header = `MSH|^~\\&${"|".repeat(16)}${charset}`;
        const result = parsed(`${header}\rNTE|1||${raw}`);
        expect(fieldShape(result.message.segments[1]?.fields[2])).toStrictEqual(
          [[[value]]],
        );
        expect(result.issues.map(({ code }) => code)).toStrictEqual(issueCodes);
      },
    );
  });

  describe("segment identifiers", () => {
    it("keeps Z segments and unknown segments without issues", () => {
      expect(codes(message("ZPI|1", "ZZ9|2", "QQQ|3"))).toStrictEqual([]);
    });

    it.each([
      ["lower case", "pid|1", "pid"],
      ["too short", "PI|1", "PI"],
      ["too long", "PIDX|1", "PIDX"],
      ["a leading digit", "1ID|1", "1ID"],
      ["a prototype key", "__proto__|1", "__proto__"],
      ["no field separator", "free text", "free text"],
    ])(
      "reports an identifier that is %s and keeps the segment",
      (_description, line, id) => {
        const input = message(line);
        const result = parsed(input);
        expect(result.message.segments[1]?.id).toBe(id);
        expect(result.issues).toStrictEqual([
          {
            code: "INVALID_SEGMENT_ID",
            severity: "error",
            message: expect.any(String) as string,
            location: {
              span: { start: msh.length + 1, end: msh.length + 1 + id.length },
              segmentIndex: 1,
            },
            value: id,
          },
        ]);
      },
    );

    it("omits the identifier from the locations of issues in an invalid segment", () => {
      const result = parsed(message("pid|\\Q\\"));
      expect(result.issues[1]?.location).toStrictEqual({
        span: { start: msh.length + 5, end: msh.length + 8 },
        segmentIndex: 1,
        field: 1,
        repetition: 1,
        component: 1,
        subcomponent: 1,
      });
    });
  });

  describe("lenient input", () => {
    it("keeps spaces at the end of the last value, like in every other segment", () => {
      const result = parsed(message("NTE|1||text \t", "NTE|2||text \t"));
      expect(result.issues).toStrictEqual([]);
      for (const segment of result.message.segments.slice(1)) {
        expect(fieldShape(segment.fields[2])).toStrictEqual([[["text \t"]]]);
      }
    });

    const lines = [msh, "PID|1", "PV1|1"];
    const canonical = parsed(lines.join("\r"));

    it.each([
      ["line feeds", "\n"],
      ["carriage returns and line feeds", "\r\n"],
    ])(
      "accepts segments separated by %s and reports it once",
      (_description, terminator) => {
        const input = lines.join(terminator);
        const result = parsed(input);
        expect(result.message.segments.map(segmentShape)).toStrictEqual(
          canonical.message.segments.map(segmentShape),
        );
        expect(result.issues).toStrictEqual([
          {
            code: "NON_STANDARD_SEGMENT_TERMINATOR",
            severity: "info",
            message: expect.any(String) as string,
            location: {
              span: { start: msh.length, end: msh.length + terminator.length },
            },
          },
        ]);
      },
    );

    it("ends segments at every terminator when MSH ends with a line feed, and reports the first once", () => {
      const input = `${msh}\nPID|1\rPV1|1\r\nZPI|1`;
      const result = parsed(input);
      expect(result.message.segments.map(({ id }) => id)).toStrictEqual([
        "MSH",
        "PID",
        "PV1",
        "ZPI",
      ]);
      expect(result.issues.map(({ location }) => location?.span)).toStrictEqual(
        [{ start: msh.length, end: msh.length + 1 }],
      );
    });

    describe("line feeds in messages whose segments end with carriage returns", () => {
      it.each([
        ["carriage returns", "\r"],
        ["carriage returns and line feeds", "\r\n"],
      ])(
        "keeps a line feed in its value when segments end with %s",
        (_description, end) => {
          const input = `${msh}${end}NTE|1||line\nfeed${end}PID|1`;
          const result = parsed(input);
          expect(result.message.segments.map(({ id }) => id)).toStrictEqual([
            "MSH",
            "NTE",
            "PID",
          ]);
          expect(
            fieldShape(result.message.segments[1]?.fields[2]),
          ).toStrictEqual([[["line\nfeed"]]]);
          const lineFeed = input.indexOf("\nfeed");
          expect(
            result.issues.find(({ code }) => code === "LINE_FEED_IN_SEGMENT"),
          ).toStrictEqual({
            code: "LINE_FEED_IN_SEGMENT",
            severity: "info",
            message: expect.any(String) as string,
            location: {
              span: { start: lineFeed, end: lineFeed + 1 },
              segmentIndex: 1,
            },
          });
        },
      );

      it("keeps a line feed at the end of the last value", () => {
        const result = parsed(`${msh}\rNTE|1||text\n\r`);
        expect(fieldShape(result.message.segments[1]?.fields[2])).toStrictEqual(
          [[["text\n"]]],
        );
      });

      it("ends the last segment at a line feed that ends the input", () => {
        const result = parsed(`${msh}\rPID|1\n`);
        expect(segmentShape(result.message.segments[1])).toStrictEqual([
          [[["1"]]],
        ]);
        expect(result.issues.map(({ code }) => code)).toStrictEqual([
          "NON_STANDARD_SEGMENT_TERMINATOR",
        ]);
      });
    });

    it("accepts a final segment terminator without an issue", () => {
      expect(codes(`${lines.join("\r")}\r`)).toStrictEqual([]);
    });

    it("removes blank lines between segments", () => {
      const input = `${msh}\r\rPID|1`;
      const result = parsed(input);
      expect(result.message.segments.map(({ id }) => id)).toStrictEqual([
        "MSH",
        "PID",
      ]);
      expect(result.issues).toStrictEqual([
        {
          code: "BLANK_LINE_REMOVED",
          severity: "info",
          message: expect.any(String) as string,
          location: { span: { start: msh.length + 1, end: msh.length + 2 } },
        },
      ]);
    });

    it("removes a byte order mark, MLLP framing and trailing whitespace, keeping offsets of the original input", () => {
      const input = `\uFEFF\u000B${lines.join("\r")}\r\u001C\r \n`;
      const result = parsed(input);
      expect(result.message.segments.map(segmentShape)).toStrictEqual(
        canonical.message.segments.map(segmentShape),
      );
      const pid = result.message.segments[1];
      expect(pid && input.slice(pid.span.start, pid.span.end)).toBe("PID|1");
      expect(
        result.issues.map(({ code, location }) => [code, location?.span]),
      ).toStrictEqual([
        ["BYTE_ORDER_MARK_REMOVED", { start: 0, end: 1 }],
        ["MLLP_FRAMING_REMOVED", { start: 1, end: 2 }],
        [
          "MLLP_FRAMING_REMOVED",
          { start: input.length - 4, end: input.length - 2 },
        ],
        [
          "TRAILING_WHITESPACE_REMOVED",
          { start: input.length - 2, end: input.length },
        ],
      ]);
    });

    it.each([
      ["spaces after the final terminator", `${msh}\r   `, msh.length + 1],
      ["blank lines", `${msh}\r\r\n\r`, msh.length + 1],
      [
        "whitespace inside the MLLP frame",
        `\u000B${msh}\r \u001C\r`,
        msh.length + 2,
      ],
    ])("removes trailing %s", (_description, input, start) => {
      const result = parsed(input);
      expect(result.message.segments).toHaveLength(1);
      expect(
        result.issues.find(({ code }) => code === "TRAILING_WHITESPACE_REMOVED")
          ?.location?.span.start,
      ).toBe(start);
    });

    it("removes an MLLP end block without a carriage return", () => {
      const input = `${msh}\r\u001C`;
      expect(parsed(input).issues).toMatchObject([
        {
          code: "MLLP_FRAMING_REMOVED",
          location: { span: { start: input.length - 1, end: input.length } },
        },
      ]);
    });

    it("lists issues in input order", () => {
      const input = `\uFEFF${msh}\nZPI|\\Q\\\n\nPID|\\H\\`;
      const starts = parsed(input).issues.map(
        ({ location }) => location?.span.start ?? -1,
      );
      expect(starts).toStrictEqual([...starts].sort((a, b) => a - b));
      expect(starts).toHaveLength(5);
    });
  });

  describe("failures", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a byte array", new TextEncoder().encode("MSH|^~\\&")],
      ["a number", 42],
    ])(
      "fails with INVALID_INPUT for %s instead of throwing",
      (_description, input) => {
        expect(parse(input as unknown as string)).toStrictEqual({
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: expect.stringContaining("toString") as string,
            issues: [
              {
                code: "INVALID_INPUT",
                severity: "error",
                message: expect.any(String) as string,
                location: { span: { start: 0, end: 0 } },
              },
            ],
          },
        });
      },
    );

    it.each([
      ["empty input", ""],
      ["whitespace only", " \r\n\t"],
      ["MLLP framing only", "\u000B\u001C\r"],
    ])("fails with EMPTY_INPUT for %s", (_description, input) => {
      const result = parse(input);
      expect(result.ok || result.error.code).toBe("EMPTY_INPUT");
    });

    it("fails with MISSING_MSH when the first segment is not MSH", () => {
      const input = "\uFEFFFHS|^~\\&\rMSH|^~\\&";
      const result = parse(input);
      expect(result).toStrictEqual({
        ok: false,
        error: {
          code: "MISSING_MSH",
          message: expect.any(String) as string,
          issues: [
            expect.objectContaining({ code: "BYTE_ORDER_MARK_REMOVED" }),
            {
              code: "MISSING_MSH",
              severity: "error",
              message: expect.any(String) as string,
              location: { span: { start: 1, end: 9 }, segmentIndex: 0 },
            },
          ],
        },
      });
    });

    it.each([
      ["INVALID_FIELD_SEPARATOR", "MSH"],
      ["INVALID_FIELD_SEPARATOR", "MSHA^~\\&"],
      ["INVALID_ENCODING_CHARACTERS", "MSH||LAB"],
      ["INVALID_ENCODING_CHARACTERS", "MSH|^^\\&|LAB"],
    ])("fails with %s for %j", (code, input) => {
      const result = parse(`${input}\nPID|1`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(code);
      expect(result.error.issues.map((issue) => issue.code)).toStrictEqual([
        "NON_STANDARD_SEGMENT_TERMINATOR",
        code,
      ]);
    });
  });

  describe("inputs with many issues", () => {
    it.each([
      [
        "escape issues in one value",
        message(`NTE|1||${"\\Q\\".repeat(300_000)}`),
      ],
      ["blank lines", `${msh}${"\r".repeat(300_000)}PID|1`],
      ["invalid segments", `${msh}\r${"pid|1\r".repeat(150_000)}`],
    ])(
      "reports at most 10,000 issues for %s, then one warning",
      (_description, input) => {
        const { issues } = parsed(input);
        expect(issues).toHaveLength(10_001);
        expect(issues.at(-1)).toStrictEqual({
          code: "TOO_MANY_ISSUES",
          severity: "warning",
          message: expect.any(String) as string,
          location: { span: { start: input.length, end: input.length } },
        });
      },
    );

    it("caps the issues of a failure before the one that stopped parsing", () => {
      const result = parse(`${"\r".repeat(300_000)}PID|1`);
      expect(
        result.ok || result.error.issues.map(({ code }) => code).slice(-2),
      ).toStrictEqual(["TOO_MANY_ISSUES", "MISSING_MSH"]);
    });
  });

  it("never puts message content into issue messages", () => {
    const input = [
      "\uFEFFMSH|^~\\|Everyman||||||||2.5.1",
      "PID|1||Everyman\\ZEveryman\\||Everyman\\XEveryman\\",
      "Everyman|1",
      "NTE|\\.Everyman\\|\\Everyman",
    ].join("\n");
    const { issues } = parsed(input);
    expect(issues.length).toBeGreaterThan(5);
    for (const issue of issues) expect(issue.message).not.toContain("Everyman");
    for (const failure of [parse("Everyman|1"), parse("MSH|Everyman|")]) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        expect(failure.error.message).not.toContain("Everyman");
        for (const issue of failure.error.issues) {
          expect(issue.message).not.toContain("Everyman");
        }
      }
    }
  });
});
