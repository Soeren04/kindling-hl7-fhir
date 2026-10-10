import type { DiagnosticReport } from "fhir/r4";
import { describe, expect, it } from "vitest";

import { mapDiagnosticReport } from "../../../src/fhir/resources/diagnostic-report";
import type { IssueCode } from "../../../src/shared/issue";
import { codes } from "../helpers";
import { segment, segmentsMapping } from "./helpers";

const v2_0203 = "http://terminology.hl7.org/CodeSystem/v2-0203";
const lipidPanel = {
  coding: [
    { system: "http://loinc.org", code: "24331-1", display: "Lipid panel" },
  ],
};

/** Maps an OBR with `fields`, after an ORC with `orc` when given, to a DiagnosticReport. */
function report(
  fields: Readonly<Record<number, string>>,
  orc?: Readonly<Record<number, string>>,
): { report: DiagnosticReport; codes: IssueCode[] } {
  const segments = [
    ...(orc === undefined ? [] : [segment("ORC", orc)]),
    segment("OBR", fields),
  ];
  const { context, at, issues } = segmentsMapping(segments, {
    settings: { identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" } },
  });
  const mapped = mapDiagnosticReport(
    context,
    at(orc === undefined ? 1 : 2),
    orc === undefined ? undefined : at(1),
    {
      subject: "urn:uuid:patient",
      encounter: undefined,
      results: ["urn:uuid:result-1", "urn:uuid:result-2"],
      presentedForm: [
        {
          contentType: "application/pdf",
          data: "JVBERi0xLjQ=",
          title: "Report",
        },
      ],
    },
  );
  return { report: mapped, codes: codes(issues) };
}

describe("mapDiagnosticReport", () => {
  it("maps the fields of the guide's OBR rows in the order of the DiagnosticReport", () => {
    const { report: mapped, codes: found } = report({
      1: "1",
      2: "ORD0001^HOSP",
      3: "FIL0001^HOSP",
      4: "24331-1^Lipid panel^LN",
      7: "20240116080000+0100",
      22: "20240116091500+0100",
      24: "CH",
      25: "F",
    });
    expect(mapped).toStrictEqual({
      resourceType: "DiagnosticReport",
      identifier: [
        {
          type: { coding: [{ system: v2_0203, code: "PLAC" }] },
          system: "urn:oid:1.2.3.4.5",
          value: "ORD0001",
        },
        {
          type: { coding: [{ system: v2_0203, code: "FILL" }] },
          system: "urn:oid:1.2.3.4.5",
          value: "FIL0001",
        },
      ],
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0074",
              code: "CH",
            },
          ],
        },
      ],
      code: lipidPanel,
      subject: { reference: "urn:uuid:patient" },
      effectiveDateTime: "2024-01-16T08:00:00+01:00",
      issued: "2024-01-16T09:15:00+01:00",
      result: [
        { reference: "urn:uuid:result-1" },
        { reference: "urn:uuid:result-2" },
      ],
      presentedForm: [
        {
          contentType: "application/pdf",
          data: "JVBERi0xLjQ=",
          title: "Report",
        },
      ],
    });
    expect(found).toStrictEqual([]);
  });

  it("takes the order numbers of the ORC when the OBR leaves them empty", () => {
    expect(
      report(
        { 3: "FIL0001^HOSP", 4: "24331-1^Lipid panel^LN", 25: "F" },
        { 1: "RE", 2: "ORD0009^HOSP", 3: "FIL0009^HOSP" },
      ).report.identifier?.map(({ value }) => value),
    ).toStrictEqual(["ORD0009", "FIL0001"]);
  });

  it("is a period from OBR-7 to OBR-8 when OBR-8 is sent", () => {
    expect(
      report({
        4: "24331-1^Lipid panel^LN",
        7: "20240116080000+0100",
        8: "20240116083000+0100",
        25: "F",
      }).report,
    ).toMatchObject({
      effectivePeriod: {
        start: "2024-01-16T08:00:00+01:00",
        end: "2024-01-16T08:30:00+01:00",
      },
    });
  });

  it("is a period with an end only when only OBR-8 is sent", () => {
    expect(
      report({ 4: "24331-1^Lipid panel^LN", 8: "20240116083000+0100", 25: "F" })
        .report.effectivePeriod,
    ).toStrictEqual({ end: "2024-01-16T08:30:00+01:00" });
  });

  it("takes the offset of the message for the issue time, an instant", () => {
    expect(
      report({ 4: "24331-1^Lipid panel^LN", 22: "20240116091500", 25: "F" }),
    ).toMatchObject({
      report: { issued: "2024-01-16T09:15:00+01:00" },
      codes: ["DATE_TIME_OFFSET_ASSUMED"],
    });
  });

  it("leaves out an issue time without any offset, which an instant needs", () => {
    const { context, at, issues } = segmentsMapping(
      [
        segment("OBR", {
          4: "24331-1^Lipid panel^LN",
          22: "20240116091500",
          25: "F",
        }),
      ],
      { sent: "20240116" },
    );
    const mapped = mapDiagnosticReport(context, at(1), undefined, {
      subject: undefined,
      encounter: undefined,
      results: [],
      presentedForm: [],
    });
    expect(mapped).toStrictEqual({
      resourceType: "DiagnosticReport",
      status: "final",
      code: lipidPanel,
    });
    expect(codes(issues)).toStrictEqual(["DATE_TIME_OFFSET_MISSING"]);
  });

  describe("status", () => {
    it.each([
      ["O", "registered"],
      ["I", "registered"],
      ["S", "registered"],
      ["P", "preliminary"],
      ["R", "partial"],
      ["C", "corrected"],
      ["X", "cancelled"],
    ])("maps %s to %s", (code, status) => {
      expect(
        report({ 4: "24331-1^Lipid panel^LN", 25: code }).report.status,
      ).toBe(status);
    });

    it("is unknown for an empty OBR-25, which FHIR requires", () => {
      expect(report({ 4: "24331-1^Lipid panel^LN" })).toMatchObject({
        report: { status: "unknown" },
        codes: ["REQUIRED_ELEMENT_DEFAULTED"],
      });
    });

    it("is unknown for a code the guide does not know, and reports it", () => {
      expect(report({ 4: "24331-1^Lipid panel^LN", 25: "Q" })).toStrictEqual({
        report: expect.objectContaining({ status: "unknown" }) as unknown,
        codes: ["UNMAPPED_CODE"],
      });
    });

    it.each(["A", "N", "Z"])(
      "is unknown for %s, which the guide leaves unmatched, without an issue",
      (code) => {
        expect(report({ 4: "24331-1^Lipid panel^LN", 25: code })).toStrictEqual(
          {
            report: expect.objectContaining({ status: "unknown" }) as unknown,
            codes: [],
          },
        );
      },
    );
  });

  it("is absent for a reason without a universal service identifier, which FHIR requires", () => {
    expect(report({ 25: "F" })).toMatchObject({
      report: {
        code: {
          extension: [
            {
              url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
              valueCode: "unknown",
            },
          ],
        },
      },
      codes: ["REQUIRED_ELEMENT_DEFAULTED"],
    });
  });
});
