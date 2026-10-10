import type { Identifier } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapCx } from "../../../src/fhir/datatypes/cx";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping, type MappingOptions } from "../helpers";

const v2_0203 = "http://terminology.hl7.org/CodeSystem/v2-0203";

/** Maps PID-3 holding `value` and returns the identifier with the codes of the issues. */
function cx(
  value: string,
  options?: MappingOptions,
): { identifier: Identifier | undefined; codes: IssueCode[] } {
  const { context, field, issues } = mapping(`PID|1||${value}`, options);
  return { identifier: mapCx(context, field(3)), codes: codes(issues) };
}

const hospital = {
  settings: {
    identifierSystems: { HOSP: "http://hospital.example/mrn" },
  },
};

describe("mapCx", () => {
  it("maps the ID number, type and system of a known namespace", () => {
    expect(cx("12345^^^HOSP^MR", hospital)).toStrictEqual({
      identifier: {
        type: { coding: [{ system: v2_0203, code: "MR" }] },
        system: "http://hospital.example/mrn",
        value: "12345",
      },
      codes: [],
    });
  });

  it.each([
    ["^^^&2.16.840.1.113883.19.5&ISO", "urn:oid:2.16.840.1.113883.19.5"],
    ["^^^HOSP&2.16.840.1.113883.19.5&ISO", "urn:oid:2.16.840.1.113883.19.5"],
    [
      "^^^&9F1C2E3A-0B4D-4E5F-8A6B-7C8D9E0F1A2B&UUID",
      "urn:uuid:9f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2b",
    ],
    ["^^^&http://hospital.example/ids&URI", "http://hospital.example/ids"],
  ])("takes the system of the universal ID in %j", (authority, system) => {
    expect(cx(`12345${authority}`)).toStrictEqual({
      identifier: { system, value: "12345" },
      codes: [],
    });
  });

  it("prefers the identifierSystems option to the universal ID, by HD.1 and then HD.2", () => {
    expect(
      cx("12345^^^HOSP&2.16.840.1.113883.19.5&ISO", hospital).identifier
        ?.system,
    ).toBe("http://hospital.example/mrn");
    const byUniversalId = {
      settings: {
        identifierSystems: {
          "2.16.840.1.113883.19.5": "http://hospital.example/oid",
        },
      },
    };
    expect(
      cx("12345^^^LAB&2.16.840.1.113883.19.5&ISO", byUniversalId).identifier
        ?.system,
    ).toBe("http://hospital.example/oid");
  });

  it("falls back to the universal ID when the option lacks the authority", () => {
    expect(
      cx("12345^^^LAB&2.16.840.1.113883.19.5&ISO", hospital).identifier?.system,
    ).toBe("urn:oid:2.16.840.1.113883.19.5");
  });

  it("looks up a universal ID of another type in the option", () => {
    const options = {
      settings: {
        identifierSystems: { "hosp.example": "urn:oid:1.2.3" },
      },
    };
    expect(cx("12345^^^&hosp.example&DNS", options).identifier?.system).toBe(
      "urn:oid:1.2.3",
    );
  });

  it.each([
    ["12345^^^HOSP", "HOSP"],
    ["12345^^^&2.16.840.1.113883.19.5", "2.16.840.1.113883.19.5"],
    ["12345^^^&1.2.x&ISO", "1.2.x"],
    ["12345^^^&not-a-uuid&UUID", "not-a-uuid"],
    ["12345^^^&relative/path&URI", "relative/path"],
  ])(
    "keeps the authority of %j as the assigner when its system is unknown",
    (value, name) => {
      const { context, field, issues } = mapping(`PID|1||${value}`);
      expect(mapCx(context, field(3))).toStrictEqual({
        value: "12345",
        assigner: { display: name },
      });
      expect(issues).toStrictEqual([
        expect.objectContaining({
          code: "UNKNOWN_IDENTIFIER_SYSTEM",
          severity: "warning",
          value: name,
          location: expect.objectContaining({
            field: 3,
            component: 4,
          }) as unknown,
        }),
      ]);
    },
  );

  it("maps an identifier without any authority to one without system, silently", () => {
    expect(cx("12345^^^^MR")).toStrictEqual({
      identifier: {
        type: { coding: [{ system: v2_0203, code: "MR" }] },
        value: "12345",
      },
      codes: [],
    });
  });

  it("does not resolve keys of Object.prototype", () => {
    const hostile = JSON.parse(
      '{"__proto__":"urn:oid:1.1","HOSP":"urn:oid:1.2"}',
    ) as Record<string, unknown>;
    const options = { settings: { identifierSystems: hostile } };
    for (const name of ["constructor", "toString", "hasOwnProperty"]) {
      expect(cx(`12345^^^${name}`, options)).toStrictEqual({
        identifier: { value: "12345", assigner: { display: name } },
        codes: ["UNKNOWN_IDENTIFIER_SYSTEM"],
      });
    }
    expect(cx("12345^^^__proto__", options).identifier?.system).toBe(
      "urn:oid:1.1",
    );
  });

  it("keeps a type code that table 0203 lacks as text", () => {
    expect(cx("12345^^^HOSP^XYZ", hospital)).toStrictEqual({
      identifier: {
        type: { text: "XYZ" },
        system: "http://hospital.example/mrn",
        value: "12345",
      },
      codes: ["UNMAPPED_CODE"],
    });
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "keeps the type code %j, which is no key of table 0203, as text",
    (type) => {
      expect(cx(`12345^^^HOSP^${type}`, hospital)).toStrictEqual({
        identifier: {
          type: { text: type },
          system: "http://hospital.example/mrn",
          value: "12345",
        },
        codes: ["UNMAPPED_CODE"],
      });
    },
  );

  it("maps the effective and expiration dates to the period", () => {
    expect(
      cx("12345^^^HOSP^MR^^20200101^20301231", hospital).identifier?.period,
    ).toStrictEqual({ start: "2020-01-01", end: "2030-12-31" });
    expect(
      cx("12345^^^HOSP^MR^^^20301231", hospital).identifier?.period,
    ).toStrictEqual({ end: "2030-12-31" });
  });

  it.each(["", '""', "^^^HOSP^MR", '""^^^HOSP'])(
    "maps nothing for %j",
    (value) => {
      expect(cx(value, hospital)).toStrictEqual({
        identifier: undefined,
        codes: [],
      });
    },
  );

  it("leaves out null components", () => {
    expect(cx('12345^^^""^""', hospital)).toStrictEqual({
      identifier: { value: "12345" },
      codes: [],
    });
  });

  it("reports a null component once, at the component", () => {
    const { context, field, issues } = mapping('PID|1||12345^^^""^""', {
      settings: { reportNulls: true },
    });
    mapCx(context, field(3));
    expect(
      issues.map(({ code, location }) => [code, location.component]),
    ).toStrictEqual([
      ["HL7_NULL_IGNORED", 4],
      ["HL7_NULL_IGNORED", 5],
    ]);
  });

  it("maps every repetition on its own", () => {
    const { context, field } = mapping(
      "PID|1||111^^^HOSP^MR~222^^^HOSP^PI",
      hospital,
    );
    expect([
      mapCx(context, field(3, 1)),
      mapCx(context, field(3, 2)),
    ]).toMatchObject([{ value: "111" }, { value: "222" }]);
  });
});
