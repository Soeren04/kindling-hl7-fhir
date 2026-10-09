import { describe, expect, it } from "vitest";

import { messageStructures } from "../../../src/hl7v2/definitions/message-structures";
import { segmentDefinitions } from "../../../src/hl7v2/definitions/segment-definitions";
import { isValidSegmentId } from "../../../src/hl7v2/segment";
import type {
  GroupElement,
  MessageStructureDefinition,
  StructureElement,
} from "../../../src/hl7v2/definitions/types";

/** `1..1`, `0..*`: the cardinality of an element as the plan and the guide write it. */
function range({ min, max }: StructureElement): string {
  return `${String(min)}..${max === "unbounded" ? "*" : String(max)}`;
}

/** The structure as indented lines, one per segment or group, to compare whole structures at once. */
function outline(elements: readonly StructureElement[], depth = 0): string[] {
  return elements.flatMap((element) => {
    const indent = "  ".repeat(depth);
    return element.kind === "segment"
      ? [`${indent}${element.id} ${range(element)}`]
      : [
          `${indent}${element.name} ${range(element)}`,
          ...outline(element.elements, depth + 1),
        ];
  });
}

/** Every segment identifier in message order, groups flattened. */
function segmentIds(elements: readonly StructureElement[]): string[] {
  return elements.flatMap((element) =>
    element.kind === "segment" ? [element.id] : segmentIds(element.elements),
  );
}

/** Every group in the structure, nested ones included. */
function groupsOf(elements: readonly StructureElement[]): GroupElement[] {
  return elements.flatMap((element) =>
    element.kind === "group" ? [element, ...groupsOf(element.elements)] : [],
  );
}

function structure(id: string): MessageStructureDefinition {
  const found = messageStructures.get(id);
  if (found === undefined) throw new Error(`${id} is not defined`);
  return found;
}

describe("message structures", () => {
  it("define ADT_A01 and ORU_R01", () => {
    expect([...messageStructures.keys()]).toStrictEqual(["ADT_A01", "ORU_R01"]);
  });

  it("key each structure by its own identifier", () => {
    for (const [key, definition] of messageStructures) {
      expect(definition.id).toBe(key);
    }
  });

  it.each([...messageStructures.values()].map((value) => [value.id, value]))(
    "start %s with a required MSH",
    (_id, definition) => {
      expect(definition.elements[0]).toStrictEqual({
        kind: "segment",
        id: "MSH",
        min: 1,
        max: 1,
      });
    },
  );

  it.each([...messageStructures.values()].map((value) => [value.id, value]))(
    "give every group of %s a required element",
    (_id, definition) => {
      for (const group of groupsOf(definition.elements)) {
        expect(
          group.elements.some((element) => element.min === 1),
          group.name,
        ).toBe(true);
      }
    },
  );

  it.each([...messageStructures.values()].map((value) => [value.id, value]))(
    "name the groups of %s uniquely",
    (_id, definition) => {
      const names = groupsOf(definition.elements).map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    },
  );

  it.each([...messageStructures.values()].map((value) => [value.id, value]))(
    "use three-character segment identifiers in %s",
    (_id, definition) => {
      for (const id of segmentIds(definition.elements)) {
        expect(isValidSegmentId(id), id).toBe(true);
      }
    },
  );

  it("refer to segments that have field definitions, or to the known ones without", () => {
    const withoutFields = new Set([
      "ACC",
      "AL1",
      "CTD",
      "CTI",
      "DB1",
      "DG1",
      "DRG",
      "DSC",
      "FT1",
      "GT1",
      "IN1",
      "IN2",
      "IN3",
      "NK1",
      "PDA",
      "PR1",
      "ROL",
      "SFT",
      "SPM",
      "TQ1",
      "TQ2",
      "UB1",
      "UB2",
    ]);
    const used = new Set(
      [...messageStructures.values()].flatMap(({ elements }) =>
        segmentIds(elements),
      ),
    );
    const undefinedHere = [...used].filter((id) => !segmentDefinitions.has(id));
    expect(new Set(undefinedHere)).toStrictEqual(withoutFields);
  });
});

describe("ADT_A01", () => {
  it("lists every segment and group of the 2.5.1 syntax with its cardinality", () => {
    expect(outline(structure("ADT_A01").elements)).toStrictEqual([
      "MSH 1..1",
      "SFT 0..*",
      "EVN 1..1",
      "PID 1..1",
      "PD1 0..1",
      "ROL 0..*",
      "NK1 0..*",
      "PV1 1..1",
      "PV2 0..1",
      "ROL 0..*",
      "DB1 0..*",
      "OBX 0..*",
      "AL1 0..*",
      "DG1 0..*",
      "DRG 0..1",
      "PROCEDURE 0..*",
      "  PR1 1..1",
      "  ROL 0..*",
      "GT1 0..*",
      "INSURANCE 0..*",
      "  IN1 1..1",
      "  IN2 0..1",
      "  IN3 0..*",
      "  ROL 0..*",
      "ACC 0..1",
      "UB1 0..1",
      "UB2 0..1",
      "PDA 0..1",
    ]);
  });
});

describe("ORU_R01", () => {
  it("lists every segment and group of the 2.5.1 syntax with its cardinality", () => {
    expect(outline(structure("ORU_R01").elements)).toStrictEqual([
      "MSH 1..1",
      "SFT 0..*",
      "PATIENT_RESULT 1..*",
      "  PATIENT 0..1",
      "    PID 1..1",
      "    PD1 0..1",
      "    NTE 0..*",
      "    NK1 0..*",
      "    VISIT 0..1",
      "      PV1 1..1",
      "      PV2 0..1",
      "  ORDER_OBSERVATION 1..*",
      "    ORC 0..1",
      "    OBR 1..1",
      "    NTE 0..*",
      "    TIMING_QTY 0..*",
      "      TQ1 1..1",
      "      TQ2 0..*",
      "    CTD 0..1",
      "    OBSERVATION 0..*",
      "      OBX 1..1",
      "      NTE 0..*",
      "    FT1 0..*",
      "    CTI 0..*",
      "    SPECIMEN 0..*",
      "      SPM 1..1",
      "      OBX 0..*",
      "DSC 0..1",
    ]);
  });

  it("keeps the order of the results: observations, then financial, trial and specimen segments", () => {
    const order = groupsOf(structure("ORU_R01").elements)
      .find(({ name }) => name === "ORDER_OBSERVATION")
      ?.elements.map((element) =>
        element.kind === "segment" ? element.id : element.name,
      );
    expect(order).toStrictEqual([
      "ORC",
      "OBR",
      "NTE",
      "TIMING_QTY",
      "CTD",
      "OBSERVATION",
      "FT1",
      "CTI",
      "SPECIMEN",
    ]);
  });
});
