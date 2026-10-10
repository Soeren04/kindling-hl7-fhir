import type { Observation } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapObservation } from "../../../src/fhir/resources/observation";
import { mapObservationValue } from "../../../src/fhir/resources/observation-value";
import type { IssueCode } from "../../../src/shared/issue";
import { codes } from "../helpers";
import { segment, segmentsMapping } from "./helpers";

const delimiters = { component: "^", subcomponent: "&" };
const dataAbsentReason =
  "http://terminology.hl7.org/CodeSystem/data-absent-reason";
const interpretation =
  "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";
const cholesterol = {
  coding: [
    { system: "http://loinc.org", code: "2093-3", display: "Cholesterol" },
  ],
};

/**
 * Maps an OBX with `fields` (and NTE segments with the texts `notes`) to an Observation, in an order with the OBR
 * fields `order` when they are given.
 */
function observation(
  fields: Readonly<Record<number, string>>,
  notes: readonly string[] = [],
  order?: Readonly<Record<number, string>>,
): { observation: Observation; codes: IssueCode[] } {
  const { context, at, issues } = segmentsMapping(
    [
      segment("OBX", fields),
      ...notes.map((note) => segment("NTE", { 1: "1", 3: note })),
      segment("OBR", order ?? {}),
    ],
    {
      settings: { identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" } },
    },
  );
  const obx = at(1);
  const value = mapObservationValue(context, obx, {
    inReport: true,
    delimiters,
  });
  const mapped = mapObservation(
    context,
    obx,
    value,
    notes.map((_, index) => at(index + 2)),
    {
      subject: "urn:uuid:patient",
      encounter: "urn:uuid:encounter",
      delimiters,
      order: order === undefined ? undefined : at(notes.length + 2),
    },
  );
  return { observation: mapped, codes: codes(issues) };
}

const complete = {
  1: "1",
  2: "NM",
  3: "2093-3^Cholesterol^LN",
  5: "196",
  6: "mg/dL",
  7: "<200",
  8: "H~A",
  11: "F",
  14: "20240116080000+0100",
  16: "0050^Everyman^Abel^^^Dr^^^HOSP",
  17: "LAB01^Enzymatic^L",
};

/** The complete OBX without its method, whose local coding system is reported, so a test sees only its own issues. */
const plain = { ...complete, 17: "" };

describe("mapObservation", () => {
  it("maps the fields of the guide's OBX rows in the order of the Observation", () => {
    const { observation: mapped } = observation(complete, [
      "Fasting sample.",
      "Line one~Line two",
    ]);
    expect(mapped).toStrictEqual({
      resourceType: "Observation",
      status: "final",
      code: cholesterol,
      subject: { reference: "urn:uuid:patient" },
      encounter: { reference: "urn:uuid:encounter" },
      effectiveDateTime: "2024-01-16T08:00:00+01:00",
      performer: [
        {
          type: "Practitioner",
          identifier: { system: "urn:oid:1.2.3.4.5", value: "0050" },
          display: "Dr Abel Everyman",
        },
      ],
      valueQuantity: { value: 196, unit: "mg/dL" },
      interpretation: [
        { coding: [{ system: interpretation, code: "H", display: "High" }] },
        {
          coding: [{ system: interpretation, code: "A", display: "Abnormal" }],
        },
      ],
      note: [{ text: "Fasting sample." }, { text: "Line one\nLine two" }],
      method: { coding: [{ code: "LAB01", display: "Enzymatic" }] },
      referenceRange: [{ text: "<200" }],
    });
    expect(Object.keys(mapped)).toStrictEqual([
      "resourceType",
      "status",
      "code",
      "subject",
      "encounter",
      "effectiveDateTime",
      "performer",
      "valueQuantity",
      "interpretation",
      "note",
      "method",
      "referenceRange",
    ]);
  });

  it("takes the time of the order (OBR-7) when OBX-14 is empty", () => {
    const order = { 7: "20240116075500+0100" };
    expect(
      observation({ ...complete, 14: "" }, [], order).observation
        .effectiveDateTime,
    ).toBe("2024-01-16T07:55:00+01:00");
    expect(observation(complete, [], order).observation.effectiveDateTime).toBe(
      "2024-01-16T08:00:00+01:00",
    );
  });

  it("takes the period of the order (OBR-7 to OBR-8) when OBX-14 is empty", () => {
    const { observation: mapped } = observation({ ...complete, 14: "" }, [], {
      7: "20240116075500+0100",
      8: "20240116081500+0100",
    });
    expect(mapped.effectivePeriod).toStrictEqual({
      start: "2024-01-16T07:55:00+01:00",
      end: "2024-01-16T08:15:00+01:00",
    });
    expect(mapped.effectiveDateTime).toBeUndefined();
  });

  it("has no time outside an order when OBX-14 is empty", () => {
    const { observation: mapped } = observation({ ...complete, 14: "" });
    expect(mapped.effectiveDateTime).toBeUndefined();
    expect(mapped.effectivePeriod).toBeUndefined();
  });

  describe("interpretation", () => {
    it("leaves out a flag the guide leaves unmatched, silently", () => {
      const { observation: mapped, codes: found } = observation({
        ...plain,
        8: "TOX~L",
      });
      expect(mapped.interpretation).toStrictEqual([
        { coding: [{ system: interpretation, code: "L", display: "Low" }] },
      ]);
      expect(found).toStrictEqual([]);
    });

    it("leaves out and reports a flag the guide does not know", () => {
      const { observation: mapped, codes: found } = observation({
        ...plain,
        8: "ZZ",
      });
      expect(mapped.interpretation).toBeUndefined();
      expect(found).toStrictEqual(["UNMAPPED_CODE"]);
    });
  });

  describe("status", () => {
    it.each([
      ["F", "final"],
      ["P", "preliminary"],
      ["C", "corrected"],
      ["A", "amended"],
      ["W", "entered-in-error"],
      ["D", "entered-in-error"],
    ])("maps %s to %s and keeps the value", (code, status) => {
      expect(observation({ ...complete, 11: code }).observation).toMatchObject({
        status,
        valueQuantity: { value: 196 },
      });
    });

    it("cancels a result that could not be obtained (X), without its value", () => {
      const { observation: mapped } = observation({ ...complete, 11: "X" });
      expect(mapped.status).toBe("cancelled");
      expect(mapped.valueQuantity).toBeUndefined();
      expect(mapped.dataAbsentReason).toStrictEqual({
        coding: [{ system: dataAbsentReason, code: "not-performed" }],
      });
    });

    it("states that a result was not asked for (N), which the guide maps to no status", () => {
      const { observation: mapped, codes: found } = observation({
        ...plain,
        11: "N",
      });
      expect(mapped.status).toBe("unknown");
      expect(mapped.valueQuantity).toBeUndefined();
      expect(mapped.dataAbsentReason).toStrictEqual({
        coding: [{ system: dataAbsentReason, code: "not-asked" }],
      });
      expect(found).toStrictEqual([]);
    });

    it.each(["I", "R", "S"])(
      "is unknown for %s, which the guide leaves unmatched, without an issue",
      (code) => {
        const { observation: mapped, codes: found } = observation({
          ...plain,
          11: code,
        });
        expect(mapped.status).toBe("unknown");
        expect(found).toStrictEqual([]);
      },
    );

    it("is unknown for a code the guide does not know, and reports it", () => {
      const { observation: mapped, codes: found } = observation({
        ...plain,
        11: "Z",
      });
      expect(mapped.status).toBe("unknown");
      expect(found).toStrictEqual(["UNMAPPED_CODE"]);
    });

    it("is unknown for an empty OBX-11, which FHIR requires", () => {
      const { observation: mapped, codes: found } = observation({
        ...complete,
        11: "",
      });
      expect(mapped.status).toBe("unknown");
      expect(found).toContain("REQUIRED_ELEMENT_DEFAULTED");
    });
  });

  it("is absent for a reason without a code, which FHIR requires", () => {
    const { observation: mapped, codes: found } = observation({
      2: "ST",
      5: "x",
      11: "F",
    });
    expect(mapped.code).toStrictEqual({
      extension: [
        {
          url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
          valueCode: "unknown",
        },
      ],
    });
    expect(found).toStrictEqual(["REQUIRED_ELEMENT_DEFAULTED"]);
  });

  it("puts repeated values into components with the code of the observation", () => {
    const { observation: mapped } = observation({ ...complete, 5: "196~1,5" });
    expect(mapped.component).toStrictEqual([
      { code: cholesterol, valueQuantity: { value: 196, unit: "mg/dL" } },
      { code: cholesterol, valueString: "1,5" },
    ]);
    expect(mapped.valueQuantity).toBeUndefined();
  });

  it("states why a component has no value", () => {
    const { observation: mapped } = observation({
      ...complete,
      2: "DT",
      5: "20240115~20240230",
    });
    expect(mapped.component).toStrictEqual([
      { code: cholesterol, valueDateTime: "2024-01-15" },
      {
        code: cholesterol,
        dataAbsentReason: {
          coding: [{ system: dataAbsentReason, code: "error" }],
        },
      },
    ]);
  });

  it("has neither value nor reason when OBX-5 is empty", () => {
    const { observation: mapped } = observation({
      2: "NM",
      3: "2093-3^Cholesterol^LN",
      11: "F",
    });
    expect(mapped).toStrictEqual({
      resourceType: "Observation",
      status: "final",
      code: cholesterol,
      subject: { reference: "urn:uuid:patient" },
      encounter: { reference: "urn:uuid:encounter" },
    });
  });
});
