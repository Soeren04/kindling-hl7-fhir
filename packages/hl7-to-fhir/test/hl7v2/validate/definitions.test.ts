import { describe, expect, it } from "vitest";

import { defineSegment } from "../../../src/hl7v2/define-segment";
import type { DefinitionOptions } from "../../../src/hl7v2/definition-options";
import { group } from "../../../src/hl7v2/group";
import { validate } from "../../../src/hl7v2/validate";
import type { IssueCode } from "../../../src/shared/issue";
import { parsed } from "../helpers";
import { adtWith } from "./messages";

const zpi = defineSegment({
  id: "ZPI",
  fields: [
    { name: "setId", dataType: "SI" },
    { name: "favouriteColour", dataType: "ST", optionality: "R" },
    { name: "lastVisit", dataType: "DT" },
    { name: "nicknames", dataType: "XPN", maxRepetitions: 2 },
    { name: "sex", dataType: "IS", table: "0001" },
    { name: "visits", dataType: "NM", maxRepetitions: "unbounded" },
  ],
});

/** The code and position of every issue of the valid ADT^A01 message with extra segments. */
function described(
  extra: readonly string[],
  options: DefinitionOptions = { segments: [zpi] },
  segments: readonly string[] = adtWith(),
): unknown[] {
  const { message } = parsed([...segments, ...extra].join("\r"));
  return validate(message, options).map(({ code, location }) => {
    const { segmentId, field, repetition, component, subcomponent } = location;
    return [code, segmentId, field, repetition, component, subcomponent];
  });
}

describe("defineSegment", () => {
  it("numbers the fields by their position and fills in the defaults", () => {
    expect(
      defineSegment({
        id: "ZPI",
        fields: [
          { name: "setId", dataType: "SI" },
          {
            name: "sex",
            dataType: "IS",
            optionality: "R",
            maxRepetitions: "unbounded",
            table: "0001",
          },
        ],
      }),
    ).toStrictEqual({
      id: "ZPI",
      fields: [
        {
          position: 1,
          name: "setId",
          dataType: "SI",
          optionality: "O",
          maxRepetitions: 1,
        },
        {
          position: 2,
          name: "sex",
          dataType: "IS",
          optionality: "R",
          maxRepetitions: "unbounded",
          table: "0001",
        },
      ],
    });
  });

  it("defines a segment without fields", () => {
    expect(defineSegment({ id: "ZZZ", fields: [] })).toStrictEqual({
      id: "ZZZ",
      fields: [],
    });
  });
});

describe("validate with segment definitions", () => {
  it("accepts a valid defined Z segment anywhere", () => {
    const valid = "ZPI|1|blue|20240115|Everyman^Adam~Everyman|F|1~2~3";
    expect(described([valid])).toStrictEqual([]);
    const [msh = "", ...rest] = adtWith();
    expect(described([], undefined, [msh, valid, ...rest])).toStrictEqual([]);
  });

  it("reports an undefined Z segment, but not a defined one", () => {
    expect(described(["ZPI|1|blue"], {})).toStrictEqual([
      [
        "UNDEFINED_Z_SEGMENT",
        "ZPI",
        undefined,
        undefined,
        undefined,
        undefined,
      ],
    ]);
  });

  it("checks the fields of a defined segment with every rule", () => {
    expect(described(["ZPI|A||2024-01-15|a~b~c|Q|1~x|extra"])).toStrictEqual([
      ["INVALID_SEQUENCE_ID", "ZPI", 1, 1, 1, 1],
      ["REQUIRED_FIELD_MISSING", "ZPI", 2, undefined, undefined, undefined],
      ["INVALID_DATE", "ZPI", 3, 1, 1, 1],
      ["TOO_MANY_REPETITIONS", "ZPI", 4, 3, undefined, undefined],
      ["UNKNOWN_USER_DEFINED_CODE", "ZPI", 5, 1, 1, 1],
      ["INVALID_NUMBER", "ZPI", 6, 2, 1, 1],
      ["UNEXPECTED_FIELD", "ZPI", 7, undefined, undefined, undefined],
    ]);
  });

  it("checks the components of a composite field of a defined segment", () => {
    expect(described([`ZPI|1|blue||Everyman${"^".repeat(14)}x`])).toStrictEqual(
      [["UNEXPECTED_COMPONENT", "ZPI", 4, 1, 15, undefined]],
    );
  });

  it("checks defined segments in every version, built-in ones only in 2.5", () => {
    const msh = "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.3";
    const segments = adtWith({ msh, pid: "PID|1||||Everyman|||Q" });
    expect(described(["ZPI|1"], undefined, segments)).toStrictEqual([
      ["UNSUPPORTED_VERSION", "MSH", 12, undefined, undefined, undefined],
      ["REQUIRED_FIELD_MISSING", "ZPI", 2, undefined, undefined, undefined],
    ]);
  });

  it("replaces the built-in definition of a segment with the same identifier", () => {
    const pid = defineSegment({
      id: "PID",
      fields: [{ name: "setId", dataType: "SI", optionality: "R" }],
    });
    const segments = adtWith({ pid: "PID|1||||Everyman" });
    expect(described([], { segments: [pid] }, segments)).toStrictEqual([
      ["UNEXPECTED_FIELD", "PID", 5, undefined, undefined, undefined],
    ]);
  });

  it("uses the last of several definitions with one identifier", () => {
    const loose = defineSegment({
      id: "ZPI",
      fields: [{ name: "anything", dataType: "ST" }],
    });
    expect(described(["ZPI|A"], { segments: [zpi, loose] })).toStrictEqual([]);
    expect(described(["ZPI|A"], { segments: [loose, zpi] })).toContainEqual([
      "INVALID_SEQUENCE_ID",
      "ZPI",
      1,
      1,
      1,
      1,
    ]);
  });

  it("allows a defined segment the structure does not contain, and checks it", () => {
    const obr = defineSegment({
      id: "OBR",
      fields: [{ name: "setId", dataType: "SI" }],
    });
    expect(described(["OBR|x"], { segments: [obr] })).toStrictEqual([
      ["INVALID_SEQUENCE_ID", "OBR", 1, 1, 1, 1],
    ]);
  });

  it("does not look into a field whose type varies", () => {
    const zed = defineSegment({
      id: "ZED",
      fields: [{ name: "anything", dataType: "varies" }],
    });
    expect(described(["ZED|a^b^c^d"], { segments: [zed] })).toStrictEqual([]);
  });
});

/** A value of the wrong type, as plain JavaScript can pass it. */
function untyped(value: unknown): never {
  return value as never;
}

describe("defineSegment on malformed input", () => {
  const field = { name: "setId", dataType: "SI" };
  it.each([
    ["no definition", undefined, TypeError, "the definition must be an object"],
    ["no identifier", { fields: [] }, TypeError, "id must be a string"],
    [
      "an identifier in lower case",
      { id: "zpi", fields: [] },
      RangeError,
      'id "zpi" must be three upper-case letters or digits, starting with a letter',
    ],
    [
      "an identifier of four letters",
      { id: "ZPID", fields: [] },
      RangeError,
      "id",
    ],
    [
      "fields that are not an array",
      { id: "ZPI" },
      TypeError,
      "fields must be an array",
    ],
    [
      "a field that is null",
      { id: "ZPI", fields: [null] },
      TypeError,
      "fields[0] must be an object",
    ],
    [
      "a field without name",
      { id: "ZPI", fields: [{ dataType: "ST" }] },
      TypeError,
      "fields[0].name must be a string",
    ],
    [
      "a field with an empty name",
      { id: "ZPI", fields: [{ name: "", dataType: "ST" }] },
      RangeError,
      "fields[0].name must not be empty",
    ],
    [
      "a field without data type",
      { id: "ZPI", fields: [{ name: "a" }] },
      TypeError,
      "fields[0].dataType must be a string",
    ],
    [
      "a data type the library does not know",
      { id: "ZPI", fields: [field, { name: "document", dataType: "ED" }] },
      RangeError,
      'fields[1].dataType "ED" is not a data type the library knows',
    ],
    [
      "an optionality that is not a string",
      { id: "ZPI", fields: [{ ...field, optionality: 1 }] },
      TypeError,
      "fields[0].optionality must be a string",
    ],
    [
      "an unknown optionality",
      { id: "ZPI", fields: [{ ...field, optionality: "Y" }] },
      RangeError,
      "must be one of R, O, C, B and X",
    ],
    [
      "repetitions that are a string",
      { id: "ZPI", fields: [{ ...field, maxRepetitions: "2" }] },
      TypeError,
      "fields[0].maxRepetitions must be a number",
    ],
    [
      "no repetitions",
      { id: "ZPI", fields: [{ ...field, maxRepetitions: 0 }] },
      RangeError,
      "at least 1",
    ],
    [
      "fractional repetitions",
      { id: "ZPI", fields: [{ ...field, maxRepetitions: 1.5 }] },
      RangeError,
      "whole number",
    ],
    [
      "unsafe repetitions",
      { id: "ZPI", fields: [{ ...field, maxRepetitions: 2 ** 53 }] },
      RangeError,
      "whole number",
    ],
    [
      "a table that is a number",
      { id: "ZPI", fields: [{ ...field, table: 1 }] },
      TypeError,
      "fields[0].table must be a string",
    ],
    [
      "a table of three digits",
      { id: "ZPI", fields: [{ ...field, table: "001" }] },
      RangeError,
      "four digits",
    ],
  ])("throws for %s", (_case, input, type, message) => {
    expect(() => defineSegment(untyped(input))).toThrow(type);
    expect(() => defineSegment(untyped(input))).toThrow(message);
  });
});

describe("validate and group with definitions not made by defineSegment", () => {
  const { message } = parsed([...adtWith(), "ZPI|A"].join("\r"));

  /** The codes of the field rules, which only validate applies. */
  const fieldCodes: ReadonlySet<IssueCode> = new Set([
    "REQUIRED_FIELD_MISSING",
    "INVALID_SEQUENCE_ID",
  ]);

  /** The code and value of every issue of validate and group, which report invalid definitions alike. */
  function reported(options: unknown): unknown[] {
    const fromValidate = validate(message, untyped(options));
    const fromGroup = group(message, untyped(options)).issues;
    expect(fromGroup).toStrictEqual(
      fromValidate.filter(({ code }) => !fieldCodes.has(code)),
    );
    return fromValidate.map(({ code, value }) => [code, value]);
  }

  it("accepts a plain object with the shape defineSegment returns", () => {
    const plain = {
      id: "ZPI",
      fields: [
        {
          position: 1,
          name: "setId",
          dataType: "SI",
          optionality: "O",
          maxRepetitions: 1,
        },
      ],
    };
    expect(reported({ segments: [plain] })).toStrictEqual([
      ["INVALID_SEQUENCE_ID", "A"],
    ]);
  });

  it.each([
    [
      "fields numbered out of order",
      {
        id: "ZPI",
        fields: [
          {
            position: 2,
            name: "setId",
            dataType: "SI",
            optionality: "O",
            maxRepetitions: 1,
          },
        ],
      },
      "options.segments[0]: fields[0].position must be 1: fields are numbered from 1 in order",
    ],
    [
      "a field without optionality",
      {
        id: "ZPI",
        fields: [
          { position: 1, name: "setId", dataType: "SI", maxRepetitions: 1 },
        ],
      },
      "options.segments[0]: fields[0].optionality must be a string",
    ],
    [
      "a field without repetitions",
      {
        id: "ZPI",
        fields: [
          { position: 1, name: "setId", dataType: "SI", optionality: "O" },
        ],
      },
      'options.segments[0]: fields[0].maxRepetitions must be a number or "unbounded"',
    ],
    [
      "a definition that is null",
      null,
      "options.segments[0]: the definition must be an object",
    ],
  ])(
    "reports and ignores a definition with %s",
    (_case, definition, problem) => {
      expect(reported({ segments: [definition] })).toStrictEqual([
        ["INVALID_DEFINITION", problem],
        ["UNDEFINED_Z_SEGMENT", undefined],
      ]);
    },
  );

  it("keeps the valid definitions next to an invalid one", () => {
    expect(
      reported({ segments: [{ id: "zpi", fields: [] }, zpi] }),
    ).toStrictEqual([
      [
        "INVALID_DEFINITION",
        'options.segments[0]: id "zpi" must be three upper-case letters or digits, starting with a letter',
      ],
      ["INVALID_SEQUENCE_ID", "A"],
      ["REQUIRED_FIELD_MISSING", undefined],
    ]);
  });

  it.each([
    ["no options", undefined],
    ["empty options", {}],
    ["options without definitions", { segments: undefined }],
  ])("accepts %s", (_case, options) => {
    expect(reported(options)).toStrictEqual([
      ["UNDEFINED_Z_SEGMENT", undefined],
    ]);
  });

  it.each([
    ["options that are null", null],
    ["options that are a string", "ZPI"],
    ["segments that are not an array", { segments: zpi }],
  ])("reports %s", (_case, options) => {
    expect(reported(options)).toStrictEqual([
      [
        "INVALID_DEFINITION",
        "options must be an object whose segments, if any, are an array of segment definitions",
      ],
      ["UNDEFINED_Z_SEGMENT", undefined],
    ]);
  });
});
