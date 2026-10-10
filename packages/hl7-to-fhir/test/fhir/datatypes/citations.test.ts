// Every data type mapper names the ConceptMap of the HL7 Version 2 to FHIR guide it follows and the source rows it
// implements. This test checks those citations against the rows the guide's maps contain (guide-maps.json, extracted
// from the guide's npm package), so a typo or a row the guide does not have cannot pass as a citation.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cweCitations } from "../../../src/fhir/datatypes/cwe";
import { cxCitation } from "../../../src/fhir/datatypes/cx";
import { drCitation, tsCitations } from "../../../src/fhir/datatypes/date-time";
import { eiCitation } from "../../../src/fhir/datatypes/ei";
import { hdCitation } from "../../../src/fhir/datatypes/hd";
import { nmCitation } from "../../../src/fhir/datatypes/nm";
import { plCitation } from "../../../src/fhir/datatypes/pl";
import { snCitations } from "../../../src/fhir/datatypes/sn";
import { xadCitations } from "../../../src/fhir/datatypes/xad";
import { xtnCitation } from "../../../src/fhir/datatypes/xtn";
import { xcnCitation } from "../../../src/fhir/datatypes/xcn";
import { xpnCitations } from "../../../src/fhir/datatypes/xpn";
import {
  type MappingCitation,
  mappingGuide,
} from "../../../src/fhir/mapping-guide";

interface GuideMaps {
  readonly package: string;
  readonly conceptMaps: Readonly<Record<string, readonly string[]>>;
}

const guideMaps = JSON.parse(
  readFileSync(new URL("guide-maps.json", import.meta.url), "utf8"),
) as GuideMaps;

/** The citations of every data type mapper, by the data types they map. */
const citations: Readonly<Record<string, readonly MappingCitation[]>> = {
  "TS, DTM": tsCitations,
  "CWE, CE": cweCitations,
  CX: [cxCitation],
  DR: [drCitation],
  EI: [eiCitation],
  HD: [hdCitation],
  NM: [nmCitation],
  PL: [plCitation],
  SN: snCitations,
  XAD: xadCitations,
  XCN: [xcnCitation],
  XPN: xpnCitations,
  XTN: [xtnCitation],
};

describe("the citations of the data type mappers", () => {
  it("refer to the release of the guide the rows were extracted from", () => {
    expect(guideMaps.package).toBe(
      `hl7.fhir.uv.v2mappings@${mappingGuide.version}`,
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
