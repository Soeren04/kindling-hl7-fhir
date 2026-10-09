import { describe, expect, it } from "vitest";

import {
  checkLaterHeader,
  declaredComponentSeparator,
  encodingCharactersSpan,
  findHeaderValue,
  isDelimiterCharacter,
  readCharset,
  trailerCountSpan,
} from "../../src/hl7v2/header";
import type { Issue } from "../../src/shared/issue";

const delimiters = { field: "|", repetition: "~", component: "^" };

/** Reads MSH-`field` of a segment that spans the whole input. */
function header(msh: string, field: number): string | undefined {
  const span = findHeaderValue(
    msh,
    { start: 0, end: msh.length },
    delimiters,
    field,
  );
  return span && msh.slice(span.start, span.end);
}

describe("findHeaderValue", () => {
  const msh = String.raw`MSH|^~\&|LAB|HOSP|||20240101||ADT^A01|1|P|2.5.1^DEU~2.4|||||DE|UNICODE UTF-8~8859/1`;

  it.each([
    [3, "LAB"],
    [4, "HOSP"],
    [9, "ADT"],
    [12, "2.5.1"],
    [18, "UNICODE UTF-8"],
  ])(
    "finds the first component of the first repetition of MSH-%i",
    (field, value) => {
      expect(header(msh, field)).toBe(value);
    },
  );

  it.each([
    ["an empty field", 5],
    ["a field after the end of the segment", 19],
  ])("returns undefined for %s", (_description, field) => {
    expect(header(msh, field)).toBeUndefined();
  });

  it("returns undefined for a field whose first component is empty", () => {
    expect(header(String.raw`MSH|^~\&|^LAB`, 3)).toBeUndefined();
  });

  it("does not read past the end of the segment", () => {
    const input = String.raw`MSH|^~\&|LAB` + "\rPID|1|2";
    const segment = { start: 0, end: input.indexOf("\r") };
    expect(findHeaderValue(input, segment, delimiters, 3)).toStrictEqual({
      start: 9,
      end: 12,
    });
    expect(findHeaderValue(input, segment, delimiters, 4)).toBeUndefined();
  });
});

describe("encodingCharactersSpan", () => {
  it.each([
    [String.raw`MSH|^~\&|LAB`, { start: 4, end: 8 }],
    [String.raw`MSH|^~\&`, { start: 4, end: 8 }],
    ["MSH||LAB", { start: 4, end: 4 }],
  ])("finds MSH-2 in %s", (msh, span) => {
    expect(
      encodingCharactersSpan(msh, { start: 0, end: msh.length }, "|"),
    ).toStrictEqual(span);
  });

  it("starts relative to the segment and stops at its end", () => {
    const input = "PID|1\rMSH#^~\\&\r#";
    expect(
      encodingCharactersSpan(input, { start: 6, end: 14 }, "#"),
    ).toStrictEqual({ start: 10, end: 14 });
  });
});

describe("isDelimiterCharacter", () => {
  it("accepts exactly the 32 printable ASCII punctuation characters", () => {
    const accepted = Array.from({ length: 0x80 }, (_, code) =>
      String.fromCharCode(code),
    ).filter(isDelimiterCharacter);
    expect(accepted.join("")).toBe(
      String.raw`!"#$%&'()*+,-./:;<=>?@[\]^_` + "`{|}~",
    );
  });

  it.each(["", "||", "é", "\u{1F600}"])("rejects %j", (text) => {
    expect(isDelimiterCharacter(text)).toBe(false);
  });
});

describe("trailerCountSpan", () => {
  it.each([
    ["BTS|2", "2"],
    ["BTS|12|note", "12"],
    ["BTS|2^note", "2"],
    ["FTS#3#", "3"],
    ["BTS|", ""],
    ["BTS", ""],
  ])("finds the count of %s", (trailer, count) => {
    const span = trailerCountSpan(
      trailer,
      { start: 0, end: trailer.length },
      "^",
    );
    expect(trailer.slice(span.start, span.end)).toBe(count);
  });

  it("stops at the end of the segment, not at a later separator", () => {
    const input = "BTS|2\rPID|1";
    const span = trailerCountSpan(input, { start: 0, end: 5 }, "^");
    expect(input.slice(span.start, span.end)).toBe("2");
  });
});

describe("readCharset", () => {
  const read = (msh: string) => {
    const issues: Issue[] = [];
    const charset = readCharset(
      msh,
      { start: 0, end: msh.length },
      { field: "|", repetition: "~", component: "^" },
      issues,
    );
    return { charset, codes: issues.map(({ code }) => code) };
  };
  const mshWith = (name: string) => `MSH|^~\\&${"|".repeat(16)}${name}`;

  it("reads a character set of HL7 table 0211 without an issue", () => {
    expect(read(mshWith("8859/1"))).toStrictEqual({
      charset: "iso-8859-1",
      codes: [],
    });
  });

  it("reports a spelling that table 0211 does not use", () => {
    expect(read(mshWith("UTF-8"))).toStrictEqual({
      charset: "utf-8",
      codes: ["NON_STANDARD_CHARACTER_SET"],
    });
  });

  it("defaults to ASCII when MSH-18 is empty or missing", () => {
    expect(read(mshWith("")).charset).toBe("ascii");
    expect(read("MSH|^~\\&|LAB").charset).toBe("ascii");
  });
});

describe("checkLaterHeader", () => {
  const first = String.raw`MSH|^~\&|A` + "\r";
  // MSH, MSH-1 and MSH-2 of the first segment.
  const declaration = { start: 0, end: 8 };
  const check = (later: string) => {
    const input = first + later;
    const issues: Issue[] = [];
    checkLaterHeader(
      input,
      { start: first.length, end: input.length },
      1,
      declaration,
      issues,
    );
    return issues.map(({ code }) => code);
  };

  it("reports a second header with the same delimiters as a warning", () => {
    expect(check(String.raw`MSH|^~\&|B`)).toStrictEqual(["UNEXPECTED_MSH"]);
    expect(check(String.raw`MSH|^~\&`)).toStrictEqual(["UNEXPECTED_MSH"]);
  });

  it("reports a second header without delimiters as an error", () => {
    expect(check("MSH")).toStrictEqual(["UNEXPECTED_MSH_DELIMITERS"]);
  });

  it("reports a second header with other delimiters as an error", () => {
    expect(check(String.raw`MSH#^~\&#B`)).toStrictEqual([
      "UNEXPECTED_MSH_DELIMITERS",
    ]);
  });

  it.each(["PID|1", "MSHX|1", "MS", "MSHé"])(
    "ignores %s, which does not start a header",
    (later) => {
      expect(check(later)).toStrictEqual([]);
    },
  );
});

describe("declaredComponentSeparator", () => {
  const declared = (segment: string) =>
    declaredComponentSeparator(segment, { start: 0, end: segment.length });

  it("reads the first encoding character of the header", () => {
    expect(declared(String.raw`BHS|^~\&|A`)).toBe("^");
    expect(declared(String.raw`FHS#*~\&#A`)).toBe("*");
  });

  it.each(["BHS", "BHS|", "BHS||A", "BHS|a|A", "BHS|||A"])(
    "defaults to ^ for %s, which declares no delimiter",
    (segment) => {
      expect(declared(segment)).toBe("^");
    },
  );
});
