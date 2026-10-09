import { describe, expect, it } from "vitest";

import {
  encodingCharactersSpan,
  findHeaderValue,
} from "../../src/hl7v2/header";

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
