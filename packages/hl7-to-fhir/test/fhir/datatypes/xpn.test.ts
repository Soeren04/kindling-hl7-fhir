import type { HumanName } from "fhir/r4";
import { describe, expect, it } from "vitest";

import {
  formatName,
  humanName,
  mapXpn,
  type NameParts,
} from "../../../src/fhir/datatypes/xpn";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

/** Maps PID-5 holding `value` and returns the name with the codes of the issues. */
function xpn(value: string): {
  name: HumanName | undefined;
  codes: IssueCode[];
} {
  const { context, field, issues } = mapping(`PID|1||||${value}`, {
    settings: { timezone: "+01:00" },
  });
  return { name: mapXpn(context, field(5)), codes: codes(issues) };
}

describe("mapXpn", () => {
  it.each<[string, HumanName | undefined]>([
    [
      "Everyman^Adam^A^III^Dr^^L",
      {
        use: "official",
        family: "Everyman",
        given: ["Adam", "A"],
        prefix: ["Dr"],
        suffix: ["III"],
      },
    ],
    ["Everyman", { family: "Everyman" }],
    ["^Adam", { given: ["Adam"] }],
    ["Everyman&van&Everyman^Eve", { family: "Everyman", given: ["Eve"] }],
    [
      "Everywoman^Eve^^^^MD^M^^^^^^^PhD",
      {
        use: "maiden",
        family: "Everywoman",
        given: ["Eve"],
        suffix: ["MD", "PhD"],
      },
    ],
    [
      "Everyman^Adam^Mary Anne",
      { family: "Everyman", given: ["Adam", "Mary Anne"] },
    ],
    ["", undefined],
    ['""', undefined],
    ["^^^^^^L", undefined],
  ])("maps %j", (value, name) => {
    expect(xpn(value)).toStrictEqual({ name, codes: [] });
  });

  it("maps every name type the guide maps", () => {
    const uses = ["BAD", "D", "L", "M", "MSK", "N", "NAV", "R", "TEMP"].map(
      (code) => xpn(`Everyman^^^^^^${code}`).name?.use,
    );
    expect(uses).toStrictEqual([
      "old",
      "usual",
      "official",
      "maiden",
      "anonymous",
      "nickname",
      "temp",
      "official",
      "temp",
    ]);
  });

  it.each([
    "A",
    "B",
    "C",
    "F",
    "I",
    "K",
    "NB",
    "NOUSE",
    "P",
    "REL",
    "S",
    "T",
    "U",
  ])(
    "leaves out the name type %j, which the guide lists as unmatched, silently",
    (code) => {
      expect(xpn(`Everyman^^^^^^${code}`)).toStrictEqual({
        name: { family: "Everyman" },
        codes: [],
      });
    },
  );

  it.each([
    "QQ",
    "l",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
  ])(
    "reports the name type %j, which the guide does not know, and leaves it out",
    (code) => {
      const { context, field, issues } = mapping(
        `PID|1||||Everyman^^^^^^${code}`,
      );
      expect(mapXpn(context, field(5))).toStrictEqual({ family: "Everyman" });
      expect(issues).toStrictEqual([
        expect.objectContaining({
          code: "UNMAPPED_CODE",
          severity: "warning",
          value: code,
          location: expect.objectContaining({
            field: 5,
            component: 7,
          }) as unknown,
        }),
      ]);
    },
  );

  it("maps every repetition of the field on its own", () => {
    const { context, field } = mapping(
      "PID|1||||Everyman^Adam^^^^^L~Everywoman^Eve^^^^^M",
    );
    expect([
      mapXpn(context, field(5, 1)),
      mapXpn(context, field(5, 2)),
      mapXpn(context, field(5, 3)),
    ]).toStrictEqual([
      { use: "official", family: "Everyman", given: ["Adam"] },
      { use: "maiden", family: "Everywoman", given: ["Eve"] },
      undefined,
    ]);
  });

  it("takes the period from XPN.12 and XPN.13 before the range of XPN.10", () => {
    expect(
      xpn("Everyman^^^^^^^^^20200101&20201231^^20210101^20211231").name?.period,
    ).toStrictEqual({ start: "2021-01-01", end: "2021-12-31" });
    expect(
      xpn("Everyman^^^^^^^^^20200101080000&20201231").name?.period,
    ).toStrictEqual({ start: "2020-01-01T08:00:00+01:00", end: "2020-12-31" });
  });

  it("leaves out null parts", () => {
    expect(xpn('Everyman^""^^^""')).toStrictEqual({
      name: { family: "Everyman" },
      codes: [],
    });
  });

  it("maps a name whose parts are all null to nothing", () => {
    expect(xpn('""^""^""^""^""^""^""')).toStrictEqual({
      name: undefined,
      codes: [],
    });
  });

  it("leaves out a null range in XPN.10 and keeps the name", () => {
    expect(xpn('Everyman^^^^^^^^^""')).toStrictEqual({
      name: { family: "Everyman" },
      codes: [],
    });
  });

  it("reports a null name once, at the name", () => {
    const { context, field, issues } = mapping('PID|1||||""', {
      settings: { reportNulls: true },
    });
    expect(mapXpn(context, field(5))).toBeUndefined();
    expect(
      issues.map(({ code, location }) => [code, location.component]),
    ).toStrictEqual([["HL7_NULL_IGNORED", undefined]]);
  });
});

describe("humanName", () => {
  it.each<[NameParts, HumanName | undefined]>([
    [
      {
        family: "Everyman",
        given: ["Adam", undefined, "A"],
        prefix: [undefined],
        suffix: ["III", "PhD"],
      },
      { family: "Everyman", given: ["Adam", "A"], suffix: ["III", "PhD"] },
    ],
    [
      { family: undefined, given: ["Eve"], prefix: [], suffix: [] },
      { given: ["Eve"] },
    ],
    [
      { family: "Everyman", given: [], prefix: [], suffix: [] },
      { family: "Everyman" },
    ],
    [
      { family: undefined, given: [undefined], prefix: [], suffix: [] },
      undefined,
    ],
  ])("makes %j the name %j", (parts, name) => {
    // toStrictEqual tells a missing property from one that is undefined.
    expect(humanName(parts)).toStrictEqual(name);
  });
});

describe("formatName", () => {
  it.each<[HumanName, string]>([
    [
      {
        family: "Everyman",
        given: ["Adam", "A"],
        prefix: ["Dr"],
        suffix: ["III"],
      },
      "Dr Adam A Everyman III",
    ],
    [{ family: "Everyman" }, "Everyman"],
    [{ given: ["Eve"] }, "Eve"],
  ])("writes %j as %j", (name, line) => {
    expect(formatName(name)).toBe(line);
  });
});
