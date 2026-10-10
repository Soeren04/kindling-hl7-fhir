// Every resource, message and bundle mapper names the segment, message or table map of the HL7 Version 2 to FHIR
// guide it follows and the rows it implements. This test checks those citations against the rows of the guide's maps
// (guide-maps.json, extracted from the guide's npm package), as the test of the data type citations does.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bundleCitation } from "../../../src/fhir/bundle";
import type { MappingCitation } from "../../../src/fhir/mapping-guide";
import { mappingGuide } from "../../../src/fhir/mapping-guide";
import { adtA01Citation } from "../../../src/fhir/messages/adt-a01";
import { oruR01Citation } from "../../../src/fhir/messages/oru-r01";
import { diagnosticReportCitation } from "../../../src/fhir/resources/diagnostic-report";
import { encounterCitations } from "../../../src/fhir/resources/encounter";
import { observationCitations } from "../../../src/fhir/resources/observation";
import { patientCitation } from "../../../src/fhir/resources/patient";

interface GuideMaps {
  readonly package: string;
  readonly conceptMaps: Readonly<Record<string, readonly string[]>>;
}

const guideMaps = JSON.parse(
  readFileSync(new URL("guide-maps.json", import.meta.url), "utf8"),
) as GuideMaps;

const citations: Readonly<Record<string, readonly MappingCitation[]>> = {
  Patient: [patientCitation],
  Encounter: encounterCitations,
  Observation: observationCitations,
  DiagnosticReport: [diagnosticReportCitation],
  Bundle: [bundleCitation],
  ADT_A01: [adtA01Citation],
  ORU_R01: [oruR01Citation],
};

describe("the citations of the resource, message and bundle mappers", () => {
  it("refer to the release of the guide the rows were extracted from", () => {
    expect(guideMaps.package).toBe(
      `hl7.fhir.uv.v2mappings@${mappingGuide.version}`,
    );
  });

  it("cover every map of the extract, so it holds no map that nothing cites", () => {
    const cited = Object.values(citations)
      .flat()
      .map(({ conceptMap }) => conceptMap);
    expect(new Set(cited)).toStrictEqual(
      new Set(Object.keys(guideMaps.conceptMaps)),
    );
  });

  describe.each(Object.entries(citations))("of %s", (_, cited) => {
    it.each(cited.map((citation) => [citation.conceptMap, citation]))(
      "name rows of %s",
      (conceptMap, { rows }) => {
        const guideRows = new Map(Object.entries(guideMaps.conceptMaps)).get(
          conceptMap,
        );
        expect(guideRows).toBeDefined();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((row) => !guideRows?.includes(row))).toStrictEqual(
          [],
        );
      },
    );
  });
});
