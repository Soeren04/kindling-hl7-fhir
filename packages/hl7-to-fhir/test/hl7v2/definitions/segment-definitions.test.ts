import { describe, expect, it } from "vitest";

import { dataTypes } from "../../../src/hl7v2/definitions/data-types";
import { segmentDefinitions } from "../../../src/hl7v2/definitions/segment-definitions";
import { isValidSegmentId } from "../../../src/hl7v2/segment";
import type {
  FieldDefinition,
  SegmentDefinition,
} from "../../../src/hl7v2/definitions/types";

const segments = [...segmentDefinitions.values()];

/** The field at an HL7 position, failing the test when the segment has none. */
function fieldOf(segmentId: string, position: number): FieldDefinition {
  const found = segmentDefinitions
    .get(segmentId)
    ?.fields.find((candidate) => candidate.position === position);
  if (found === undefined)
    throw new Error(`${segmentId}-${String(position)} missing`);
  return found;
}

/** Every `SEG.n` and `SEG.n.m` path a segment's definition allows: what the typed path union is generated from. */
function pathsOf(segment: SegmentDefinition): string[] {
  return segment.fields.flatMap((definition) => {
    const type = dataTypes.get(definition.dataType);
    const base = `${segment.id}.${String(definition.position)}`;
    return type?.kind === "composite"
      ? [
          base,
          ...type.components.map(
            ({ position }) => `${base}.${String(position)}`,
          ),
        ]
      : [base];
  });
}

describe("segment definitions", () => {
  it("cover the segments the plan names", () => {
    expect([...segmentDefinitions.keys()]).toStrictEqual([
      "MSH",
      "EVN",
      "PID",
      "PD1",
      "PV1",
      "PV2",
      "ORC",
      "OBR",
      "OBX",
      "NTE",
    ]);
  });

  it.each(segments.map((segment) => [segment.id, segment] as const))(
    "number the fields of %s from 1 without gaps",
    (_id, segment) => {
      expect(segment.fields.map(({ position }) => position)).toStrictEqual(
        segment.fields.map((_, index) => index + 1),
      );
    },
  );

  it.each(segments.map((segment) => [segment.id, segment] as const))(
    "give the fields of %s unique identifier-style names",
    (_id, segment) => {
      const names = segment.fields.map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(/^[a-z][A-Za-z0-9]*$/);
      }
    },
  );

  it.each(segments.map((segment) => [segment.id, segment] as const))(
    "only use data types that %s can resolve",
    (_id, segment) => {
      const unknown = segment.fields.filter(
        ({ dataType }) => !dataTypes.has(dataType),
      );
      expect(unknown).toStrictEqual([]);
    },
  );

  it.each(segments.map((segment) => [segment.id, segment] as const))(
    "use valid optionality, repetition and table numbers in %s",
    (_id, segment) => {
      for (const definition of segment.fields) {
        expect(["R", "O", "C", "B", "X"]).toContain(definition.optionality);
        expect(
          definition.maxRepetitions === "unbounded" ||
            (Number.isInteger(definition.maxRepetitions) &&
              definition.maxRepetitions >= 1),
        ).toBe(true);
        if (definition.table !== undefined) {
          expect(definition.table).toMatch(/^\d{4}$/);
        }
      }
    },
  );

  it("key each segment by its own three-character identifier", () => {
    for (const [key, segment] of segmentDefinitions) {
      expect(segment.id).toBe(key);
      expect(isValidSegmentId(key)).toBe(true);
    }
  });

  it("keep reserved positions to OBX, where 2.5.1 reserves them", () => {
    const reserved = segments.flatMap((segment) =>
      segment.fields
        .filter(({ optionality }) => optionality === "X")
        .map(({ position }) => `${segment.id}-${String(position)}`),
    );
    expect(reserved).toStrictEqual(["OBX-20", "OBX-21", "OBX-22"]);
  });

  it("end each segment at its last 2.5.1 field", () => {
    expect(
      Object.fromEntries(segments.map(({ id, fields }) => [id, fields.length])),
    ).toStrictEqual({
      MSH: 21,
      EVN: 7,
      PID: 39,
      PD1: 21,
      PV1: 52,
      PV2: 49,
      ORC: 31,
      OBR: 50,
      OBX: 25,
      NTE: 4,
    });
  });

  it("allow the typed path union to be generated from the definitions", () => {
    const paths = segments.flatMap(pathsOf);
    expect(paths).toContain("PID.5.1");
    expect(paths).toContain("MSH.9.3");
    expect(paths).toContain("PID.11.3");
    expect(paths).toContain("OBX.5");
    expect(paths).not.toContain("OBX.5.1");
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("well-known fields", () => {
  it("ends OBR with the optional parent universal service identifier in OBR-50", () => {
    expect(fieldOf("OBR", 50)).toStrictEqual({
      position: 50,
      name: "parentUniversalServiceIdentifier",
      dataType: "CWE",
      optionality: "O",
      maxRepetitions: 1,
    });
  });

  it("lets PV1-45 and PV2-7 repeat without limit", () => {
    expect(fieldOf("PV1", 45)).toMatchObject({
      name: "dischargeDateTime",
      dataType: "TS",
      maxRepetitions: "unbounded",
    });
    expect(fieldOf("PV2", 7)).toMatchObject({
      name: "visitUserCode",
      table: "0130",
      maxRepetitions: "unbounded",
    });
  });

  it("keeps PID-9 optional, because it became backward compatible only after 2.5.1", () => {
    expect(fieldOf("PID", 9)).toMatchObject({
      name: "patientAlias",
      optionality: "O",
      maxRepetitions: "unbounded",
    });
  });

  it("uses the 2.5.1 names where later versions renamed a field", () => {
    expect(fieldOf("PID", 35).name).toBe("speciesCode");
    expect(fieldOf("ORC", 9).name).toBe("dateTimeOfTransaction");
  });

  it("makes PID-3 a required, repeating CX", () => {
    expect(fieldOf("PID", 3)).toStrictEqual({
      position: 3,
      name: "patientIdentifierList",
      dataType: "CX",
      optionality: "R",
      maxRepetitions: "unbounded",
    });
  });

  it("makes PID-5 a required, repeating XPN", () => {
    expect(fieldOf("PID", 5)).toMatchObject({
      name: "patientName",
      dataType: "XPN",
      optionality: "R",
      maxRepetitions: "unbounded",
    });
  });

  it("types PID-7 as a time stamp and PID-8 with table 0001", () => {
    expect(fieldOf("PID", 7)).toMatchObject({ dataType: "TS" });
    expect(fieldOf("PID", 8)).toMatchObject({
      name: "administrativeSex",
      dataType: "IS",
      table: "0001",
    });
  });

  it("marks the patient id fields PID-2 and PID-4 as backward compatible", () => {
    expect(fieldOf("PID", 2).optionality).toBe("B");
    expect(fieldOf("PID", 4).optionality).toBe("B");
  });

  it("lets OBX-5 vary, repeat, and depend on OBX-2", () => {
    expect(fieldOf("OBX", 5)).toMatchObject({
      name: "observationValue",
      dataType: "varies",
      optionality: "C",
      maxRepetitions: "unbounded",
    });
    expect(fieldOf("OBX", 2)).toMatchObject({
      name: "valueType",
      table: "0125",
    });
  });

  it("requires the observation identifier and result status in OBX", () => {
    expect(fieldOf("OBX", 3)).toMatchObject({
      dataType: "CE",
      optionality: "R",
    });
    expect(fieldOf("OBX", 11)).toMatchObject({
      dataType: "ID",
      optionality: "R",
      table: "0085",
    });
  });

  it("makes MSH-9 a required MSG whose components carry tables 0076, 0003 and 0354", () => {
    expect(fieldOf("MSH", 9)).toMatchObject({
      name: "messageType",
      dataType: "MSG",
      optionality: "R",
      maxRepetitions: 1,
    });
    const msg = dataTypes.get("MSG");
    expect(
      msg?.kind === "composite" && msg.components.map(({ table }) => table),
    ).toStrictEqual(["0076", "0003", "0354"]);
  });

  it("describes the version, processing id and profile fields of MSH", () => {
    expect(fieldOf("MSH", 11)).toMatchObject({ dataType: "PT" });
    expect(fieldOf("MSH", 12)).toMatchObject({ dataType: "VID" });
    expect(fieldOf("MSH", 18)).toMatchObject({ maxRepetitions: "unbounded" });
    expect(fieldOf("MSH", 21)).toMatchObject({
      dataType: "EI",
      maxRepetitions: "unbounded",
    });
  });

  it("requires the patient class in PV1 and the order control in ORC", () => {
    expect(fieldOf("PV1", 2)).toMatchObject({
      optionality: "R",
      table: "0004",
    });
    expect(fieldOf("ORC", 1)).toMatchObject({
      optionality: "R",
      table: "0119",
    });
  });

  it("requires the universal service identifier in OBR", () => {
    expect(fieldOf("OBR", 4)).toMatchObject({
      name: "universalServiceIdentifier",
      optionality: "R",
    });
  });

  it("allows many comment lines in NTE-3", () => {
    expect(fieldOf("NTE", 3)).toMatchObject({
      dataType: "FT",
      maxRepetitions: "unbounded",
    });
  });
});
