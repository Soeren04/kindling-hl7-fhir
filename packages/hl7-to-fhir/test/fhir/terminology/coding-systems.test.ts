import { describe, expect, it } from "vitest";

import {
  codingSystemUri,
  v2TableSystem,
} from "../../../src/fhir/terminology/coding-systems";

describe("v2TableSystem", () => {
  it("builds the THO code system URI of a table", () => {
    expect(v2TableSystem("0203")).toBe(
      "http://terminology.hl7.org/CodeSystem/v2-0203",
    );
    expect(v2TableSystem("0078")).toBe(
      "http://terminology.hl7.org/CodeSystem/v2-0078",
    );
  });
});

describe("codingSystemUri", () => {
  it.each([
    ["LN", "http://loinc.org"],
    ["SCT", "http://snomed.info/sct"],
    ["UCUM", "http://unitsofmeasure.org"],
    ["I10", "http://hl7.org/fhir/sid/icd-10"],
    ["I9C", "http://hl7.org/fhir/sid/icd-9-cm"],
    ["I9CDX", "http://hl7.org/fhir/sid/icd-9-cm"],
    ["I10C", "http://hl7.org/fhir/sid/icd-10-cm"],
    ["I10P", "http://www.cms.gov/Medicare/Coding/ICD10"],
    ["I9CP", "http://hl7.org/fhir/sid/icd-9-cm"],
    ["C4", "http://www.ama-assn.org/go/cpt"],
    ["NDC", "http://hl7.org/fhir/sid/ndc"],
    ["RXNORM", "http://www.nlm.nih.gov/research/umls/rxnorm"],
    ["CVX", "http://hl7.org/fhir/sid/cvx"],
  ])("maps %s to %s", (code, uri) => {
    expect(codingSystemUri(code)).toBe(uri);
  });

  it("maps HL7nnnn to the code system of table nnnn", () => {
    expect(codingSystemUri("HL70203")).toBe(
      "http://terminology.hl7.org/CodeSystem/v2-0203",
    );
    expect(codingSystemUri("HL70001")).toBe(v2TableSystem("0001"));
  });

  it.each(["HL7203", "HL702031", "HL7ABCD", "HL70203 ", " HL70203", "HL7"])(
    "does not treat %j as a table abbreviation",
    (code) => {
      expect(codingSystemUri(code)).toBeUndefined();
    },
  );

  it.each([
    "99LOC",
    "99zzz",
    "L",
    "",
    "UNKNOWN",
    "SNM",
    "I9",
    "ICD10CM",
    "CPT",
    "RXN",
  ])("returns undefined for local or unknown system %j", (code) => {
    expect(codingSystemUri(code)).toBeUndefined();
  });

  it("is case-sensitive", () => {
    expect(codingSystemUri("ln")).toBeUndefined();
    expect(codingSystemUri("hl70203")).toBeUndefined();
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])("returns undefined for the object property name %j", (code) => {
    expect(codingSystemUri(code)).toBeUndefined();
  });
});
