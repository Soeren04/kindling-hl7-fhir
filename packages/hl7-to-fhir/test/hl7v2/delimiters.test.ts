import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isDelimiterCharacter,
  readDelimiters,
} from "../../src/hl7v2/delimiters";
import type { Delimiters } from "../../src/hl7v2/model";
import type { Issue, LocatedIssue } from "../../src/shared/issue";
import { ok, type Result } from "../../src/shared/result";
import {
  delimiterSets,
  encodingCharactersOf,
  punctuation,
} from "./arbitraries";

const standard: Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

/**
 * Reads the delimiters of an MSH segment that spans the whole input. A successful reading carries the issues reported
 * on the way, so that one assertion covers both.
 */
function read(msh: string) {
  const issues: LocatedIssue[] = [];
  const result = readDelimiters(msh, { start: 0, end: msh.length }, issues);
  return result.ok ? ok({ ...result.value, issues }) : result;
}

/** An MSH segment with the given MSH-2 and MSH-12 and empty fields in between. */
function withVersion(encoding: string, version: string): string {
  return `MSH|${encoding}${"|".repeat(10)}${version}`;
}

function expectError(
  result: Result<unknown, Issue>,
): asserts result is { ok: false; error: Issue } {
  expect(result.ok).toBe(false);
}

describe("readDelimiters", () => {
  it.each<[string, string, Delimiters]>([
    ["the standard delimiters", String.raw`MSH|^~\&|LAB`, standard],
    ["MSH-2 that ends the segment", String.raw`MSH|^~\&`, standard],
    [
      "custom delimiters",
      "MSH#$*!%#LAB",
      {
        field: "#",
        component: "$",
        repetition: "*",
        escape: "!",
        subcomponent: "%",
      },
    ],
  ])("reads %s", (_description, msh, delimiters) => {
    expect(read(msh)).toStrictEqual({
      ok: true,
      value: { delimiters, encoding: { start: 4, end: 8 }, issues: [] },
    });
  });

  it("finds MSH-1 and MSH-2 relative to the start of the segment", () => {
    const input = String.raw`ignored MSH#$*!%#LAB`;
    const result = readDelimiters(input, { start: 8, end: input.length }, []);
    expect(result.ok && result.value.delimiters.field).toBe("#");
  });

  describe("truncation character", () => {
    it.each([["2.7"], ["2.7.1"], ["2.8.2"], ["2.10"], ["3.0"], ["2.9^DEU"]])(
      "is the fifth character of MSH-2 in version %s",
      (version) => {
        const result = read(withVersion(String.raw`^~\&#`, version));
        expect(result).toStrictEqual({
          ok: true,
          value: {
            delimiters: { ...standard, truncation: "#" },
            encoding: { start: 4, end: 9 },
            issues: [],
          },
        });
      },
    );

    it.each([
      ["version 2.5.1", "2.5.1"],
      ["version 2.6", "2.6"],
      ["version 1.9", "1.9"],
      ["a major version without minor", "3"],
      ["a hexadecimal-looking minor", "2.0x7"],
      ["an exponent", "2.1e1"],
      ["Infinity", "Infinity"],
      ["a leading space", " 2.7"],
      ["an unreadable version", "two.seven"],
      ["an empty version", ""],
    ])("is ignored with a warning in %s", (_description, version) => {
      const msh = withVersion(String.raw`^~\&#`, version);
      expect(read(msh)).toStrictEqual({
        ok: true,
        value: {
          delimiters: standard,
          encoding: { start: 4, end: 9 },
          issues: [
            {
              code: "TRUNCATION_CHARACTER_IGNORED",
              severity: "warning",
              message: expect.not.stringContaining("#") as string,
              location: {
                span: { start: 8, end: 9 },
                segmentIndex: 0,
                segmentId: "MSH",
                field: 2,
              },
              value: "#",
            },
          ],
        },
      });
    });

    it("is ignored when the segment has no MSH-12", () => {
      const result = read(String.raw`MSH|^~\&#|LAB`);
      expect(result.ok && result.value.issues.map(({ code }) => code)).toEqual([
        "TRUNCATION_CHARACTER_IGNORED",
      ]);
    });
  });

  it.each<[string, string, Partial<Delimiters>]>([
    ["no escape and subcomponent", "$*", { component: "$", repetition: "*" }],
    [
      "no subcomponent separator",
      "^~!",
      { component: "^", repetition: "~", escape: "!" },
    ],
    [
      "the standard subcomponent separator as escape character",
      "^~&",
      { component: "^", repetition: "~", escape: "&" },
    ],
  ])(
    "leaves out the omitted encoding characters when MSH-2 has %s",
    (_description, encoding, declared) => {
      const result = read(`MSH|${encoding}|LAB`);
      expect(result).toStrictEqual({
        ok: true,
        value: {
          delimiters: { field: "|", ...declared },
          encoding: { start: 4, end: 4 + encoding.length },
          issues: [
            {
              code: "ENCODING_CHARACTERS_OMITTED",
              severity: "info",
              message: expect.any(String) as string,
              location: {
                span: { start: 4, end: 4 + encoding.length },
                segmentIndex: 0,
                segmentId: "MSH",
                field: 2,
              },
              value: encoding,
            },
          ],
        },
      });
    },
  );

  it("reports a segment that ends before MSH-1", () => {
    const result = read("MSH");
    expectError(result);
    expect(result.error).toStrictEqual({
      code: "INVALID_FIELD_SEPARATOR",
      severity: "error",
      message: expect.any(String) as string,
      location: {
        span: { start: 3, end: 3 },
        segmentIndex: 0,
        segmentId: "MSH",
        field: 1,
      },
    });
  });

  it.each([
    ["a letter", "MSHA^~\\&"],
    ["a digit", "MSH1^~\\&"],
    ["a space", "MSH ^~\\&"],
    ["a carriage return", "MSH\r^~\\&"],
    ["a non-ASCII character", "MSH§^~\\&"],
  ])("rejects %s as field separator", (_description, msh) => {
    const result = read(msh);
    expectError(result);
    expect(result.error).toMatchObject({
      code: "INVALID_FIELD_SEPARATOR",
      location: { span: { start: 3, end: 4 }, field: 1 },
      value: msh.charAt(3),
    });
  });

  it.each([
    ["an empty MSH-2", "MSH||LAB", ""],
    [
      "MSH-2 with six characters",
      String.raw`MSH|^~\&#!|LAB`,
      String.raw`^~\&#!`,
    ],
    ["a letter in MSH-2", String.raw`MSH|^~\A|LAB`, String.raw`^~\A`],
    ["a space in MSH-2", "MSH|^~ &|LAB", "^~ &"],
    [
      "a repeated encoding character",
      String.raw`MSH|^^\&|LAB`,
      String.raw`^^\&`,
    ],
    [
      "a truncation character equal to another delimiter",
      String.raw`MSH|^~\&^|LAB`,
      String.raw`^~\&^`,
    ],
    ["only the component separator in MSH-2", "MSH|^|LAB", "^"],
  ])("rejects %s", (_description, msh, encoding) => {
    const result = read(msh);
    expectError(result);
    expect(result.error).toMatchObject({
      code: "INVALID_ENCODING_CHARACTERS",
      severity: "error",
      location: {
        span: { start: 4, end: 4 + encoding.length },
        segmentIndex: 0,
        segmentId: "MSH",
        field: 2,
      },
      value: encoding,
    });
  });

  propertyTest.prop([delimiterSets])(
    "reads every set of distinct punctuation delimiters",
    (delimiters) => {
      const encoding = encodingCharactersOf(delimiters);
      const msh = `MSH${delimiters.field}${encoding}${delimiters.field}LAB`;
      const span = { start: 4, end: 4 + encoding.length };
      const omitted = delimiters.subcomponent === undefined;
      expect(read(msh)).toStrictEqual({
        ok: true,
        value: {
          delimiters,
          encoding: span,
          issues: omitted
            ? [
                expect.objectContaining({
                  code: "ENCODING_CHARACTERS_OMITTED",
                  location: expect.objectContaining({ span }) as unknown,
                }),
              ]
            : [],
        },
      });
    },
  );

  propertyTest.prop([
    fc.shuffledSubarray([...punctuation], { minLength: 4, maxLength: 4 }),
    fc.nat(3),
  ])(
    "rejects every MSH-2 that repeats a character",
    ([field = "", ...encoding], repeated) => {
      const duplicate = [...encoding, encoding[repeated % encoding.length]];
      const result = read(`MSH${field}${duplicate.join("")}${field}LAB`);
      expect(result.ok).toBe(false);
    },
  );
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
