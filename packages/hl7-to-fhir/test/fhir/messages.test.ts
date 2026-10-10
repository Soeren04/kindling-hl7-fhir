import { describe, expect, it } from "vitest";

import { createMappingContext } from "../../src/fhir/context";
import { createUrlSource, sequentialIds } from "../../src/fhir/ids";
import { mapAdtA01 } from "../../src/fhir/messages/adt-a01";
import type { MappedEntry } from "../../src/fhir/messages/mapping";
import { mapOruR01 } from "../../src/fhir/messages/oru-r01";
import { group } from "../../src/hl7v2/group";
import type { Issue } from "../../src/shared/issue";
import { parsed } from "../hl7v2/helpers";
import { settingsOf } from "./helpers";

const header = "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20240116091500+0100||";
const ids = sequentialIds("messages");
const url = (index: number): string => `urn:uuid:${ids(index)}`;

/**
 * Maps a message with `mapper`, after `type` in MSH-9, and returns the entries, the codes of the issues and the
 * indexes of the segments marked as mapped, in the order they were marked.
 */
function entries(
  mapper: typeof mapAdtA01,
  type: string,
  segments: readonly string[],
): { entries: MappedEntry[]; codes: string[]; mapped: number[] } {
  const { message } = parsed(
    [`${header}${type}|MSG1|P|2.5.1`, ...segments].join("\r"),
  );
  const issues: Issue[] = [];
  const context = createMappingContext(message, settingsOf(), issues);
  const mapped: number[] = [];
  const result = mapper(
    {
      context,
      message,
      delimiters: { component: "^", subcomponent: "&" },
      nextUrl: createUrlSource(ids).next,
      markMapped: ({ segmentIndex }) => mapped.push(segmentIndex),
    },
    group(message),
  );
  return {
    entries: result,
    codes: issues.map(({ code }) => code),
    mapped: [...mapped].sort((a, b) => a - b),
  };
}

/** The resource type, fullUrl, source segment and references of each entry. */
function outline(mapped: readonly MappedEntry[]): unknown[] {
  return mapped.map(({ fullUrl, resource, source }) => ({
    type: resource.resourceType,
    fullUrl,
    segmentIndex: source.segmentIndex,
    references: JSON.stringify(resource).match(/urn:uuid:[\da-f-]+/gu) ?? [],
  }));
}

describe("mapAdtA01", () => {
  it("maps the patient, the visit of the event and the observations about it", () => {
    const { entries: mapped } = entries(mapAdtA01, "ADT^A01^ADT_A01", [
      "EVN|A01|20240116091500+0100",
      "PID|1||PATID1234||Everyman^Adam",
      "PV1|1|I",
      "PV2|||^Chest pain",
      "OBX|1|NM|8302-2^Body height^LN||180|cm|||||F",
      "OBX|2|NM|29463-7^Body weight^LN||80|kg|||||F",
    ]);
    expect(outline(mapped)).toStrictEqual([
      { type: "Patient", fullUrl: url(0), segmentIndex: 2, references: [] },
      {
        type: "Encounter",
        fullUrl: url(1),
        segmentIndex: 3,
        references: [url(0)],
      },
      {
        type: "Observation",
        fullUrl: url(2),
        segmentIndex: 5,
        references: [url(0), url(1)],
      },
      {
        type: "Observation",
        fullUrl: url(3),
        segmentIndex: 6,
        references: [url(0), url(1)],
      },
    ]);
    expect(mapped[1]?.resource).toMatchObject({
      status: "in-progress",
      reasonCode: [{ text: "Chest pain" }],
    });
  });

  it("marks the segments it maps, and not the EVN", () => {
    expect(
      entries(mapAdtA01, "ADT^A01", [
        "EVN|A01",
        "PID|1||1",
        "PV1|1|I",
        "PV2|||^Chest pain",
        "OBX|1|NM|8302-2^Body height^LN||180|cm|||||F",
        "AL1|1||^Penicillin",
      ]).mapped,
    ).toStrictEqual([2, 3, 4, 5]);
  });

  it("links no observation of a registration (A04) to the encounter", () => {
    const { entries: mapped } = entries(mapAdtA01, "ADT^A04^ADT_A01", [
      "EVN|A04",
      "PID|1||1",
      "PV1|1|O",
      "OBX|1|NM|8302-2^Body height^LN||180|cm|||||F",
    ]);
    expect(mapped[2]?.resource).toMatchObject({
      subject: { reference: url(0) },
    });
    expect(mapped[2]?.resource).not.toHaveProperty("encounter");
  });

  it("takes the encounter status from the event of MSH-9.2", () => {
    const status = (type: string): unknown =>
      entries(mapAdtA01, type, ["EVN|", "PID|1||1", "PV1|1|P"]).entries[1]
        ?.resource;
    expect(status("ADT^A01")).toMatchObject({ status: "in-progress" });
    expect(status("ADT^A08")).toMatchObject({ status: "planned" });
  });

  it("maps an encapsulated value to no attachment, as an ADT message has no report", () => {
    const { entries: mapped, codes } = entries(mapAdtA01, "ADT^A01", [
      "EVN|",
      "PID|1||1",
      "PV1|1|I",
      "OBX|1|ED|11502-2^Report^LN||^AP^PDF^Base64^JVBERi0xLjQ=||||||F",
    ]);
    expect(mapped[2]?.resource).toMatchObject({
      resourceType: "Observation",
      dataAbsentReason: { coding: [{ code: "unsupported" }] },
    });
    expect(codes).toContain("UNSUPPORTED_VALUE_TYPE");
  });

  it("maps what is there when segments are missing", () => {
    expect(
      outline(entries(mapAdtA01, "ADT^A01", ["EVN|", "PV1|1|I"]).entries),
    ).toStrictEqual([
      { type: "Encounter", fullUrl: url(0), segmentIndex: 2, references: [] },
    ]);
  });
});

describe("mapOruR01", () => {
  const oru = [
    "PID|1||PATID1234||Everyman^Adam",
    "PV1|1|O",
    "ORC|RE|ORD0001",
    "OBR|1||FIL0001|24331-1^Lipid panel^LN|||20240116080000+0100||||||||||||||||||F",
    "OBX|1|NM|2093-3^Cholesterol^LN||196|mg/dL|||||F",
    "NTE|1|L|Fasting sample.",
    "OBX|2|ED|11502-2^Laboratory report^LN||^AP^PDF^Base64^JVBERi0xLjQ=||||||F",
    "SPM|1|SPEC1",
    "OBX|3|NM|2571-8^Triglyceride^LN||110|mg/dL|||||F",
    "OBR|2||FIL0002|58410-2^CBC panel^LN|||20240116080000+0100||||||||||||||||||F",
    "OBX|1|NM|718-7^Hemoglobin^LN||14.2|g/dL|||||F",
  ];

  it("maps each order to a report before its observations, all of the patient and visit", () => {
    expect(
      outline(entries(mapOruR01, "ORU^R01^ORU_R01", oru).entries),
    ).toStrictEqual([
      { type: "Patient", fullUrl: url(0), segmentIndex: 1, references: [] },
      {
        type: "Encounter",
        fullUrl: url(1),
        segmentIndex: 2,
        references: [url(0)],
      },
      {
        type: "DiagnosticReport",
        fullUrl: url(2),
        segmentIndex: 4,
        references: [url(0), url(1), url(3), url(4)],
      },
      {
        type: "Observation",
        fullUrl: url(3),
        segmentIndex: 5,
        references: [url(0), url(1)],
      },
      {
        type: "Observation",
        fullUrl: url(4),
        segmentIndex: 9,
        references: [url(0), url(1)],
      },
      {
        type: "DiagnosticReport",
        fullUrl: url(5),
        segmentIndex: 10,
        references: [url(0), url(1), url(6)],
      },
      {
        type: "Observation",
        fullUrl: url(6),
        segmentIndex: 11,
        references: [url(0), url(1)],
      },
    ]);
  });

  it("attaches encapsulated data to the report, named by the observation, and notes to their observation", () => {
    const { entries: mapped } = entries(mapOruR01, "ORU^R01", oru);
    expect(mapped[2]?.resource).toMatchObject({
      identifier: [{ value: "ORD0001" }, { value: "FIL0001" }],
      status: "final",
      presentedForm: [
        {
          contentType: "application/pdf",
          data: "JVBERi0xLjQ=",
          title: "Laboratory report",
        },
      ],
    });
    expect(mapped[3]?.resource).toMatchObject({
      note: [{ text: "Fasting sample." }],
    });
  });

  it("marks the segments of the groups it maps, and not those of others", () => {
    // The NTE after the second OBR is a note of the order, which the mapping does not carry.
    const withOrderNote = [
      ...oru.slice(0, 10),
      "NTE|1|L|Order note",
      ...oru.slice(10),
    ];
    expect(entries(mapOruR01, "ORU^R01", withOrderNote).mapped).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 9, 10, 12,
    ]);
  });

  describe("encapsulated data", () => {
    /** The report and issue codes of an order with one ED observation of status `status`, and `notes` after it. */
    function attached(
      status: string,
      notes: readonly string[] = [],
    ): { report: unknown; codes: string[] } {
      const result = entries(mapOruR01, "ORU^R01", [
        "PID|1||PATID1234",
        "OBR|1||FIL0001|24331-1^Lipid panel^LN|||||||||||||||||||||F",
        `OBX|1|ED|11502-2^Laboratory report^LN||^AP^PDF^Base64^JVBERi0xLjQ=||||||${status}`,
        ...notes,
      ]);
      return { report: result.entries[1]?.resource, codes: result.codes };
    }

    it.each(["W", "D", "X", "N"])(
      "is left out of the report when OBX-11 is %s, and reported",
      (status) => {
        const { report, codes } = attached(status);
        expect(report).not.toHaveProperty("presentedForm");
        expect(codes).toStrictEqual(["ATTACHMENT_LEFT_OUT"]);
      },
    );

    it("is attached without its status other than final or its notes, which are reported", () => {
      const { report, codes } = attached("P", ["NTE|1|L|Read with care."]);
      expect(report).toMatchObject({
        presentedForm: [{ data: "JVBERi0xLjQ=", title: "Laboratory report" }],
      });
      expect(codes).toStrictEqual([
        "ATTACHMENT_DETAIL_DROPPED",
        "ATTACHMENT_DETAIL_DROPPED",
      ]);
    });

    it("is attached without an issue when it is final", () => {
      expect(attached("F").codes).toStrictEqual([]);
    });
  });

  it("names no attachment of an observation without a name, and skips the other groups of an order", () => {
    const { entries: mapped } = entries(mapOruR01, "ORU^R01", [
      "PID|1||PATID1234",
      "OBR|1||FIL0001|24331-1^Lipid panel^LN|||||||||||||||||||||F",
      "TQ1|1",
      "OBX|1|ED|11502-2^^LN||^AP^PDF^Base64^JVBERi0xLjQ=||||||F",
    ]);
    expect(mapped.map(({ resource }) => resource.resourceType)).toStrictEqual([
      "Patient",
      "DiagnosticReport",
    ]);
    expect(mapped[1]?.resource).toMatchObject({
      presentedForm: [{ contentType: "application/pdf", data: "JVBERi0xLjQ=" }],
    });
    expect(mapped[1]?.resource).not.toHaveProperty("presentedForm.0.title");
  });

  it("links each patient result to its own patient", () => {
    const { entries: mapped } = entries(mapOruR01, "ORU^R01", [
      "PID|1||PATID1234||Everyman^Adam",
      "OBR|1||FIL0001|24331-1^Lipid panel^LN|||||||||||||||||||||F",
      "OBX|1|NM|2093-3^Cholesterol^LN||196|mg/dL|||||F",
      "PID|2||PATID5678||Everywoman^Eve",
      "OBR|1||FIL0002|24331-1^Lipid panel^LN|||||||||||||||||||||F",
      "OBX|1|NM|2093-3^Cholesterol^LN||182|mg/dL|||||F",
    ]);
    expect(
      outline(mapped).map(
        (entry) => (entry as { references: unknown }).references,
      ),
    ).toStrictEqual([
      [],
      [url(0), url(2)],
      [url(0)],
      [],
      [url(3), url(5)],
      [url(3)],
    ]);
  });

  it("maps observations of an order without OBR without a report", () => {
    const { entries: mapped } = entries(mapOruR01, "ORU^R01", [
      "PID|1||PATID1234",
      "ORC|RE|ORD0001",
      "OBX|1|ED|11502-2^Laboratory report^LN||^AP^PDF^Base64^JVBERi0xLjQ=||||||F",
    ]);
    expect(mapped.map(({ resource }) => resource.resourceType)).toStrictEqual([
      "Patient",
      "Observation",
    ]);
    expect(mapped[1]?.resource).toMatchObject({
      dataAbsentReason: { coding: [{ code: "unsupported" }] },
    });
  });
});
