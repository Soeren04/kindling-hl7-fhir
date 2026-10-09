import type { Address } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapXad } from "../../../src/fhir/datatypes/xad";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

/** Maps PID-11 holding `value` and returns the address with the codes of the issues. */
function xad(value: string): {
  address: Address | undefined;
  codes: IssueCode[];
} {
  const { context, field, issues } = mapping(`PID|1||||||||||${value}`);
  return { address: mapXad(context, field(11)), codes: codes(issues) };
}

describe("mapXad", () => {
  it.each<[string, Address | undefined]>([
    [
      "1000 Hospital Lane^Ward 3^Ann Arbor^MI^99999^USA^H^^WA",
      {
        use: "home",
        line: ["1000 Hospital Lane", "Ward 3"],
        city: "Ann Arbor",
        district: "WA",
        state: "MI",
        postalCode: "99999",
        country: "USA",
      },
    ],
    [
      "Main Street&Main Street&10^^Springfield",
      { line: ["Main Street", "Main Street", "10"], city: "Springfield" },
    ],
    ["^^^^99999^^M", { type: "postal", postalCode: "99999" }],
    ["^^Springfield^^^^BI", { use: "billing", city: "Springfield" }],
    ["", undefined],
    ['""', undefined],
    ["^^^^^^H", undefined],
  ])("maps %j", (value, address) => {
    expect(xad(value)).toStrictEqual({ address, codes: [] });
  });

  it.each([
    ["BA", { use: "old" }],
    ["C", { use: "temp" }],
    ["B", { use: "work" }],
    ["O", { use: "work" }],
    ["SH", { type: "postal" }],
  ])("maps the address type %j", (code, kind) => {
    expect(xad(`^^Springfield^^^^${code}`).address).toStrictEqual({
      ...kind,
      city: "Springfield",
    });
  });

  it.each(["N", "BDL", "F", "L", "P", "RH", "BR", "S", "TM", "V"])(
    "leaves out the address type %j, which the guide lists as unmatched, silently",
    (code) => {
      expect(xad(`^^Springfield^^^^${code}`)).toStrictEqual({
        address: { city: "Springfield" },
        codes: [],
      });
    },
  );

  it.each([
    "HV",
    "h",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
  ])(
    "reports the address type %j, which the guide does not know, and leaves it out",
    (code) => {
      expect(xad(`^^Springfield^^^^${code}`)).toStrictEqual({
        address: { city: "Springfield" },
        codes: ["UNMAPPED_CODE"],
      });
    },
  );

  it("maps every repetition of the field on its own", () => {
    const { context, field } = mapping(
      "PID|1||||||||||Main Street^^Springfield^^^^H~Side Street^^Shelbyville^^^^O",
    );
    expect([
      mapXad(context, field(11, 1)),
      mapXad(context, field(11, 2)),
    ]).toStrictEqual([
      { use: "home", line: ["Main Street"], city: "Springfield" },
      { use: "work", line: ["Side Street"], city: "Shelbyville" },
    ]);
  });

  it("maps an address whose parts are all null to nothing", () => {
    expect(xad('""^""^""^""^""^""^""')).toStrictEqual({
      address: undefined,
      codes: [],
    });
  });

  it("leaves out a null range in XAD.12 and keeps the address", () => {
    expect(xad('^^Springfield^^^^^^^^^""')).toStrictEqual({
      address: { city: "Springfield" },
      codes: [],
    });
  });

  it("takes the period from XAD.13 and XAD.14 before the range of XAD.12", () => {
    expect(
      xad("^^Springfield^^^^^^^^^20200101&20201231^20210101").address?.period,
    ).toStrictEqual({ start: "2021-01-01" });
    expect(
      xad("^^Springfield^^^^^^^^^20200101&20201231").address?.period,
    ).toStrictEqual({ start: "2020-01-01", end: "2020-12-31" });
  });

  it("leaves out null parts", () => {
    expect(xad('""&10^^Springfield^""').address).toStrictEqual({
      line: ["10"],
      city: "Springfield",
    });
  });
});
