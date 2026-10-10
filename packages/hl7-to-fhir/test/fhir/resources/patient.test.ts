import type { Patient } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapPatient } from "../../../src/fhir/resources/patient";
import type { IssueCode } from "../../../src/shared/issue";
import { codes, type MappingOptions } from "../helpers";
import { segment, segmentsMapping } from "./helpers";

const v2_0203 = "http://terminology.hl7.org/CodeSystem/v2-0203";
const birthTime = "http://hl7.org/fhir/StructureDefinition/patient-birthTime";
const originalText = "http://hl7.org/fhir/StructureDefinition/originalText";

/** Maps a PID with `fields` and returns the Patient with the codes of the issues. */
function patient(
  fields: Readonly<Record<number, string>>,
  options?: MappingOptions,
): { patient: Patient; codes: IssueCode[] } {
  const { context, at, issues } = segmentsMapping(
    [segment("PID", fields)],
    options,
  );
  return { patient: mapPatient(context, at(1)), codes: codes(issues) };
}

const hospital = {
  settings: { identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" } },
};

describe("mapPatient", () => {
  it("maps the fields of the guide's PID rows in the order of the Patient", () => {
    expect(
      patient(
        {
          2: "OLD1^^^HOSP",
          3: "PATID1234^^^HOSP^MR~PATID5678^^^HOSP^MR",
          4: "ALT1^^^HOSP",
          5: "Everyman^Adam^A^^Mr.",
          7: "19800101",
          8: "M",
          9: "Everyman^Ad",
          11: "2222 Home Street^^Anytown^^99999^USA^H",
          13: "^^PH^^^555^5552004",
          14: "^^PH^^^555^5550000",
        },
        hospital,
      ),
    ).toStrictEqual({
      patient: {
        resourceType: "Patient",
        identifier: [
          {
            type: { coding: [{ system: v2_0203, code: "MR" }] },
            system: "urn:oid:1.2.3.4.5",
            value: "PATID1234",
          },
          {
            type: { coding: [{ system: v2_0203, code: "MR" }] },
            system: "urn:oid:1.2.3.4.5",
            value: "PATID5678",
          },
          { system: "urn:oid:1.2.3.4.5", value: "OLD1" },
          { system: "urn:oid:1.2.3.4.5", value: "ALT1" },
        ],
        name: [
          { family: "Everyman", given: ["Adam", "A"], prefix: ["Mr."] },
          { family: "Everyman", given: ["Ad"] },
        ],
        telecom: [
          { system: "phone", value: "555 5552004", use: "home" },
          { system: "phone", value: "555 5550000", use: "work" },
        ],
        gender: "male",
        birthDate: "1980-01-01",
        address: [
          {
            use: "home",
            line: ["2222 Home Street"],
            city: "Anytown",
            postalCode: "99999",
            country: "USA",
          },
        ],
      },
      codes: [],
    });
  });

  it("is a Patient without elements when the PID holds nothing", () => {
    expect(patient({ 1: "1" })).toStrictEqual({
      patient: { resourceType: "Patient" },
      codes: [],
    });
  });

  describe("birth", () => {
    it("keeps a time of birth in the guide's extension, so the date loses nothing", () => {
      expect(patient({ 7: "198001011230+0100" }).patient).toStrictEqual({
        resourceType: "Patient",
        birthDate: "1980-01-01",
        _birthDate: {
          extension: [
            { url: birthTime, valueDateTime: "1980-01-01T12:30:00+01:00" },
          ],
        },
      });
    });

    it("takes the offset of the message for a time of birth without one", () => {
      expect(patient({ 7: "198001011230" }).patient._birthDate).toStrictEqual({
        extension: [
          { url: birthTime, valueDateTime: "1980-01-01T12:30:00+01:00" },
        ],
      });
    });

    it("keeps only the date when no offset is known", () => {
      expect(
        patient({ 7: "198001011230" }, { sent: "20240115" }),
      ).toStrictEqual({
        patient: { resourceType: "Patient", birthDate: "1980-01-01" },
        codes: ["DATE_TIME_OFFSET_MISSING"],
      });
    });

    it("leaves out a date of birth that does not exist", () => {
      expect(patient({ 7: "19800230" })).toStrictEqual({
        patient: { resourceType: "Patient" },
        codes: ["INVALID_DATE_TIME"],
      });
    });
  });

  describe("gender", () => {
    it.each([
      ["F", "female"],
      ["M", "male"],
      ["U", "unknown"],
    ])("maps %s to %s", (code, gender) => {
      expect(patient({ 8: code })).toStrictEqual({
        patient: { resourceType: "Patient", gender },
        codes: [],
      });
    });

    it.each(["O", "A", "N"])(
      "keeps %s as sent next to the shared code other",
      (code) => {
        expect(patient({ 8: code }).patient).toStrictEqual({
          resourceType: "Patient",
          gender: "other",
          _gender: { extension: [{ url: originalText, valueString: code }] },
        });
      },
    );

    it("leaves out and reports a code the ConceptMap does not have", () => {
      expect(patient({ 8: "Q" })).toStrictEqual({
        patient: { resourceType: "Patient" },
        codes: ["UNMAPPED_CODE"],
      });
    });

    it("is case-sensitive, as HL7 codes are", () => {
      expect(patient({ 8: "f" }).codes).toStrictEqual(["UNMAPPED_CODE"]);
    });
  });

  describe("telecom", () => {
    it("keeps the use of XTN.2 over the use of the field", () => {
      expect(
        patient({ 13: "^WPN^PH^^^555^5552004", 14: "^PRN^PH^^^555^5550000" })
          .patient.telecom,
      ).toStrictEqual([
        { system: "phone", value: "555 5552004", use: "work" },
        { system: "phone", value: "555 5550000", use: "home" },
      ]);
    });

    it("keeps the mobile use a cellular phone implies", () => {
      expect(
        patient({ 13: "^^CP^^^555^5552004" }).patient.telecom,
      ).toStrictEqual([
        { system: "phone", value: "555 5552004", use: "mobile" },
      ]);
    });

    it("maps every repetition of the field", () => {
      expect(
        patient({ 13: "^^PH^^^555^5552004~^^Internet^adam@example.org" })
          .patient.telecom,
      ).toStrictEqual([
        { system: "phone", value: "555 5552004", use: "home" },
        { system: "email", value: "adam@example.org", use: "home" },
      ]);
    });
  });

  describe("deceased", () => {
    it("takes the date and time of death (PID-29) over the indicator (PID-30)", () => {
      expect(
        patient({ 29: "202401151030+0100", 30: "Y" }).patient,
      ).toStrictEqual({
        resourceType: "Patient",
        deceasedDateTime: "2024-01-15T10:30:00+01:00",
      });
    });

    it.each([
      ["Y", true],
      ["N", false],
    ])("maps the indicator %s to %s", (code, deceased) => {
      expect(patient({ 30: code }).patient).toStrictEqual({
        resourceType: "Patient",
        deceasedBoolean: deceased,
      });
    });

    it("reports an indicator that is neither Y nor N", () => {
      expect(patient({ 30: "X" })).toStrictEqual({
        patient: { resourceType: "Patient" },
        codes: ["UNMAPPED_CODE"],
      });
    });
  });

  describe("multiple birth", () => {
    it("takes the birth order (PID-25) over the indicator (PID-24)", () => {
      expect(patient({ 24: "Y", 25: "2" }).patient).toStrictEqual({
        resourceType: "Patient",
        multipleBirthInteger: 2,
      });
    });

    it("falls back to the indicator when the birth order is no whole number", () => {
      expect(patient({ 24: "Y", 25: "1.5" }).patient).toStrictEqual({
        resourceType: "Patient",
        multipleBirthBoolean: true,
      });
    });
  });

  describe("explicit nulls", () => {
    it("leaves them out, reporting each once when asked to", () => {
      expect(
        patient(
          { 5: '""', 7: '""', 8: '""', 30: '""' },
          {
            settings: { reportNulls: true },
          },
        ),
      ).toStrictEqual({
        patient: { resourceType: "Patient" },
        codes: [
          "HL7_NULL_IGNORED",
          "HL7_NULL_IGNORED",
          "HL7_NULL_IGNORED",
          "HL7_NULL_IGNORED",
        ],
      });
    });
  });
});
