import type { CodeableConcept } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapCwe } from "../../../src/fhir/datatypes/cwe";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, mapping, type MappingOptions } from "../helpers";

/** Maps OBX-3 holding `value` and returns the concept with the codes of the issues. */
function cwe(
  value: string,
  options?: MappingOptions & { table?: string },
): { concept: CodeableConcept | undefined; codes: IssueCode[] } {
  const { context, field, issues } = mapping(`OBX|1|NM|${value}`, options);
  return {
    concept: mapCwe(context, field(3), options?.table),
    codes: codes(issues),
  };
}

const loinc = "http://loinc.org";

describe("mapCwe", () => {
  it.each<[string, CodeableConcept | undefined]>([
    [
      "718-7^Hemoglobin^LN",
      { coding: [{ system: loinc, code: "718-7", display: "Hemoglobin" }] },
    ],
    [
      "271649006^Systolic blood pressure^SCT",
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "271649006",
            display: "Systolic blood pressure",
          },
        ],
      },
    ],
    [
      "MR^Medical record number^HL70203",
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            code: "MR",
            display: "Medical record number",
          },
        ],
      },
    ],
    [
      "718-7^Hemoglobin^LN^HGB^Hemoglobin^I10^2.73^2019^Hb in blood",
      {
        coding: [
          {
            system: loinc,
            version: "2.73",
            code: "718-7",
            display: "Hemoglobin",
          },
          {
            system: "http://hl7.org/fhir/sid/icd-10",
            version: "2019",
            code: "HGB",
            display: "Hemoglobin",
          },
        ],
        text: "Hb in blood",
      },
    ],
    ["^Hemoglobin, free text", { text: "Hemoglobin, free text" }],
    ["^^^^^^^^Original only", { text: "Original only" }],
    ["", undefined],
    ['""', undefined],
    ["^^LN", undefined],
  ])("maps %j", (value, concept) => {
    expect(cwe(value)).toStrictEqual({ concept, codes: [] });
  });

  it("takes the codeSystems option before table 0396", () => {
    const options = {
      settings: {
        codeSystems: {
          L: "http://lab.example/codes",
          LN: "http://lab.example/loinc-copy",
        },
      },
    };
    expect(cwe("GLU^Glucose^L", options).concept?.coding?.[0]?.system).toBe(
      "http://lab.example/codes",
    );
    expect(cwe("718-7^^LN", options).concept?.coding?.[0]?.system).toBe(
      "http://lab.example/loinc-copy",
    );
  });

  it("does not resolve keys of Object.prototype", () => {
    const options = { settings: { codeSystems: {} } };
    for (const name of ["__proto__", "constructor", "toString"]) {
      expect(cwe(`X^^${name}`, options)).toStrictEqual({
        concept: { coding: [{ code: "X" }] },
        codes: ["UNKNOWN_CODE_SYSTEM"],
      });
    }
  });

  it("keeps a code of an unknown coding system without system and reports it", () => {
    const { context, field, issues } = mapping("OBX|1|NM|GLU^Glucose^99LAB");
    expect(mapCwe(context, field(3))).toStrictEqual({
      coding: [{ code: "GLU", display: "Glucose" }],
    });
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "UNKNOWN_CODE_SYSTEM",
        severity: "warning",
        value: "99LAB",
        location: expect.objectContaining({
          field: 3,
          component: 3,
        }) as unknown,
      }),
    ]);
  });

  it("puts a code without coding system into the table of its field", () => {
    expect(cwe("MR^Medical record number", { table: "0203" })).toStrictEqual({
      concept: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            code: "MR",
            display: "Medical record number",
          },
        ],
      },
      codes: [],
    });
  });

  it("keeps a code without coding system outside a table as it is, silently", () => {
    expect(cwe("GLU")).toStrictEqual({
      concept: { coding: [{ code: "GLU" }] },
      codes: [],
    });
  });

  it("does not apply the field's table to the alternate coding", () => {
    expect(cwe("A^^^B", { table: "0203" })).toStrictEqual({
      concept: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            code: "A",
          },
          { code: "B" },
        ],
      },
      codes: [],
    });
  });

  it("maps a concept that has only an alternate triplet", () => {
    expect(cwe("^^^HGB^Hemoglobin^I10")).toStrictEqual({
      concept: {
        coding: [
          {
            system: "http://hl7.org/fhir/sid/icd-10",
            code: "HGB",
            display: "Hemoglobin",
          },
        ],
      },
      codes: [],
    });
  });

  it("takes CWE.2 as the text of a concept whose first triplet has no code", () => {
    expect(cwe("^Foo^^456^Bar^LN")).toStrictEqual({
      concept: {
        coding: [{ system: loinc, code: "456", display: "Bar" }],
        text: "Foo",
      },
      codes: [],
    });
  });

  it("prefers the original text to CWE.2 as the text", () => {
    expect(cwe("^Foo^^456^Bar^LN^^^Original").concept?.text).toBe("Original");
    expect(cwe("123^Foo^LN^^^^^^Original").concept?.text).toBe("Original");
    expect(cwe("123^Foo^LN").concept?.text).toBeUndefined();
  });

  it("leaves out parts that are all null", () => {
    expect(cwe('""^""^""')).toStrictEqual({ concept: undefined, codes: [] });
  });

  it("still reports a coding system that is named and unknown", () => {
    expect(cwe("A^^99LAB^B^^99LAB").codes).toStrictEqual([
      "UNKNOWN_CODE_SYSTEM",
      "UNKNOWN_CODE_SYSTEM",
    ]);
  });

  it("maps a CE, the first six components", () => {
    expect(cwe("718-7^Hemoglobin^LN^HGB^Hb^99LAB").concept).toStrictEqual({
      coding: [
        { system: loinc, code: "718-7", display: "Hemoglobin" },
        { code: "HGB", display: "Hb" },
      ],
    });
  });
});
