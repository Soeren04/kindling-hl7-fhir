import { describe, expect, it } from "vitest";

import {
  absentElement,
  absentReason,
} from "../../../src/fhir/resources/absent";

describe("absentElement", () => {
  it("holds only the data-absent-reason extension with the reason", () => {
    expect(absentElement("unknown")).toStrictEqual({
      extension: [
        {
          url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
          valueCode: "unknown",
        },
      ],
    });
  });
});

describe("absentReason", () => {
  it("is a concept of the data-absent-reason code system", () => {
    expect(absentReason("not-performed")).toStrictEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
          code: "not-performed",
        },
      ],
    });
  });
});
