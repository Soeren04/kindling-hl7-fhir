import type { Reference } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapEi } from "../../../src/fhir/datatypes/ei";
import { mapPl } from "../../../src/fhir/datatypes/pl";
import { mapXcn } from "../../../src/fhir/datatypes/xcn";
import { part } from "../../../src/fhir/source";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping } from "../helpers";

const hospital = {
  settings: {
    identifierSystems: { HOSP: "http://hospital.example/staff" },
  },
};

/** Maps PV1-7 (attending doctor, an XCN) holding `value`. */
function xcn(value: string): {
  reference: Reference | undefined;
  codes: IssueCode[];
} {
  const { context, field, issues } = mapping(`PV1|1|I|||||${value}`, hospital);
  return { reference: mapXcn(context, field(7)), codes: codes(issues) };
}

/** Maps PV1-3 (assigned patient location, a PL) holding `value`. */
function pl(value: string): {
  reference: Reference | undefined;
  codes: IssueCode[];
} {
  const { context, field, issues } = mapping(`PV1|1|I|${value}`, hospital);
  return { reference: mapPl(context, field(3)), codes: codes(issues) };
}

describe("mapXcn", () => {
  it("maps the ID number to the identifier and the name to the display", () => {
    expect(
      xcn("0010^Everyman^Adam^A^III^Dr^^^HOSP^^^^PRN^^^^^^^^PhD"),
    ).toStrictEqual({
      reference: {
        type: "Practitioner",
        identifier: {
          type: {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0203",
                code: "PRN",
              },
            ],
          },
          system: "http://hospital.example/staff",
          value: "0010",
        },
        display: "Dr Adam A Everyman III PhD",
      },
      codes: [],
    });
  });

  it.each<[string, Reference | undefined, IssueCode[]]>([
    [
      "^Everywoman^Eve",
      { type: "Practitioner", display: "Eve Everywoman" },
      [],
    ],
    ["0010", { type: "Practitioner", identifier: { value: "0010" } }, []],
    [
      "0010^^^^^^^^LAB",
      {
        type: "Practitioner",
        identifier: { value: "0010", assigner: { display: "LAB" } },
      },
      ["UNKNOWN_IDENTIFIER_SYSTEM"],
    ],
    ["", undefined, []],
    ['""', undefined, []],
    ["^^^^^^^^HOSP", undefined, []],
  ])("maps %j", (value, reference, issued) => {
    expect(xcn(value)).toStrictEqual({ reference, codes: issued });
  });

  it("maps every repetition of the field on its own", () => {
    const { context, field } = mapping(
      "PV1|1|I|||||0010^Everyman^Adam~0011^Everywoman^Eve",
      hospital,
    );
    expect([
      mapXcn(context, field(7, 1)),
      mapXcn(context, field(7, 2)),
      mapXcn(context, field(7, 3)),
    ]).toStrictEqual([
      {
        type: "Practitioner",
        identifier: { value: "0010" },
        display: "Adam Everyman",
      },
      {
        type: "Practitioner",
        identifier: { value: "0011" },
        display: "Eve Everywoman",
      },
      undefined,
    ]);
  });
});

describe("mapPl", () => {
  it.each<[string, Reference | undefined]>([
    ["4W^401^A^HOSP", { type: "Location", display: "4W, 401, A, HOSP" }],
    [
      "4W^401^A^&2.16.840.1.113883.19.5&ISO^^^Main^3",
      {
        type: "Location",
        display: "4W, 401, A, Main, 3, 2.16.840.1.113883.19.5",
      },
    ],
    ["4W^401^^^^^^^North wing", { type: "Location", display: "North wing" }],
    [
      "4W^^^^^^^^^LOC123&HOSP",
      {
        type: "Location",
        identifier: {
          system: "http://hospital.example/staff",
          value: "LOC123",
        },
        display: "4W",
      },
    ],
    ["4W^401", { type: "Location", display: "4W, 401" }],
    ["^^^&2.16.840.1&ISO", { type: "Location", display: "2.16.840.1" }],
    [
      "^^^^^^^^^LOC123&HOSP",
      {
        type: "Location",
        identifier: {
          system: "http://hospital.example/staff",
          value: "LOC123",
        },
      },
    ],
    ["", undefined],
    ['""', undefined],
    ["^^^^NOT^C", undefined],
  ])("maps %j", (value, reference) => {
    expect(pl(value)).toStrictEqual({ reference, codes: [] });
  });
});

describe("mapEi", () => {
  it.each([
    ["ORD1^LAB", "http://hospital.example/staff"],
    ["ORD1^^2.16.840.1.113883.19.5^ISO", "urn:oid:2.16.840.1.113883.19.5"],
  ])("resolves the system of %j", (value, system) => {
    const { context, field } = mapping(`ORC|NW|${value}`, {
      settings: {
        identifierSystems: { LAB: "http://hospital.example/staff" },
      },
    });
    expect(mapEi(context, field(2))).toStrictEqual({ system, value: "ORD1" });
  });

  it("maps nothing without an entity identifier", () => {
    const { context, field, issues } = mapping("ORC|NW|^LAB");
    expect(mapEi(context, field(2))).toBeUndefined();
    expect(mapEi(context, part(field(2), 9))).toBeUndefined();
    expect(issues).toStrictEqual([]);
  });
});
