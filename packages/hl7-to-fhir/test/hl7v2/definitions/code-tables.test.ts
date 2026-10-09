import { describe, expect, it } from "vitest";

import { codeTables } from "../../../src/hl7v2/definitions/code-tables";
import { dataTypes } from "../../../src/hl7v2/definitions/data-types";
import { messageStructureByEvent } from "../../../src/hl7v2/definitions/message-structure-events";
import { messageStructures } from "../../../src/hl7v2/definitions/message-structures";
import { segmentDefinitions } from "../../../src/hl7v2/definitions/segment-definitions";
import type { CodeTable } from "../../../src/hl7v2/definitions/types";

/** The table with the given number; fails the test when it is missing. */
function table(number: string): CodeTable {
  const found = codeTables.get(number);
  if (found === undefined) throw new Error(`table ${number} is missing`);
  return found;
}

describe("code tables", () => {
  it("hold the tables the validation rules need", () => {
    expect([...codeTables.keys()]).toStrictEqual([
      "0001",
      "0003",
      "0004",
      "0076",
      "0085",
      "0104",
      "0123",
      "0203",
      "0354",
    ]);
  });

  it("are keyed by their own number", () => {
    for (const [key, entry] of codeTables) {
      expect(entry.number).toBe(key);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.codes.size).toBeGreaterThan(0);
    }
  });

  it.each([
    ["0001", "user-defined"],
    ["0004", "user-defined"],
    ["0003", "hl7-defined"],
    ["0076", "hl7-defined"],
    ["0085", "hl7-defined"],
    ["0104", "hl7-defined"],
    ["0123", "hl7-defined"],
    ["0203", "hl7-defined"],
    ["0354", "hl7-defined"],
  ] as const)("mark table %s as %s", (number, kind) => {
    expect(table(number).kind).toBe(kind);
  });

  it("list no empty or padded code", () => {
    for (const { number, codes } of codeTables.values()) {
      for (const code of codes) {
        expect(code, number).toBe(code.trim());
        expect(code.length, number).toBeGreaterThan(0);
      }
    }
  });

  it("include the codes of administrative sex and patient class", () => {
    expect(table("0001").codes).toStrictEqual(
      new Set(["F", "M", "O", "U", "A", "N", "X"]),
    );
    expect(table("0004").codes).toStrictEqual(
      new Set(["E", "I", "O", "P", "R", "B", "C", "N", "U"]),
    );
  });

  it("include the result status codes of OBX-11 and OBR-25", () => {
    for (const code of ["F", "P", "C", "D", "X", "W"]) {
      expect(table("0085").codes.has(code), code).toBe(true);
    }
    for (const code of ["O", "I", "S", "A", "P", "C", "R", "F", "X"]) {
      expect(table("0123").codes.has(code), code).toBe(true);
    }
  });

  it("include the version this library targets in table 0104", () => {
    expect(table("0104").codes.has("2.5.1")).toBe(true);
    expect(table("0104").codes.has("2.5")).toBe(true);
  });

  it("include the common identifier types in table 0203", () => {
    for (const code of ["MR", "PI", "SS", "DL", "AN", "VN"]) {
      expect(table("0203").codes.has(code), code).toBe(true);
    }
  });

  it("include the message codes and trigger events of ADT and ORU", () => {
    expect(table("0076").codes.has("ADT")).toBe(true);
    expect(table("0076").codes.has("ORU")).toBe(true);
    for (const event of ["A01", "A04", "A08", "A13", "R01"]) {
      expect(table("0003").codes.has(event), event).toBe(true);
    }
  });

  it("include the structures that are defined", () => {
    for (const id of messageStructures.keys()) {
      expect(table("0354").codes.has(id), id).toBe(true);
    }
  });

  it("are referenced by number from the fields and components that use them", () => {
    const referenced = new Set<string>();
    for (const { fields } of segmentDefinitions.values()) {
      for (const { table: number } of fields) {
        if (number !== undefined) referenced.add(number);
      }
    }
    for (const type of dataTypes.values()) {
      if (type.kind !== "composite") continue;
      for (const { table: number } of type.components) {
        if (number !== undefined) referenced.add(number);
      }
    }
    for (const number of codeTables.keys()) {
      expect(referenced.has(number), number).toBe(true);
    }
  });
});

describe("message structure by event", () => {
  it.each(["A01", "A04", "A08", "A13"])("maps ADT^%s to ADT_A01", (event) => {
    expect(messageStructureByEvent.get(`ADT^${event}`)).toBe("ADT_A01");
  });

  it("maps ORU^R01 to ORU_R01", () => {
    expect(messageStructureByEvent.get("ORU^R01")).toBe("ORU_R01");
  });

  it("maps events to structures of table 0354", () => {
    for (const [key, structure] of messageStructureByEvent) {
      expect(table("0354").codes.has(structure), key).toBe(true);
    }
  });

  it("keys events by a message code and trigger event of tables 0076 and 0003", () => {
    for (const key of messageStructureByEvent.keys()) {
      const [code, event] = key.split("^");
      expect(table("0076").codes.has(code ?? ""), key).toBe(true);
      expect(table("0003").codes.has(event ?? ""), key).toBe(true);
    }
  });

  it("maps the events that 2.5.1 gives to the structure of another event", () => {
    expect(
      Object.fromEntries(
        [
          "ADT^A28",
          "ADT^A31",
          "ADT^A44",
          "ADT^A55",
          "MFN^M14",
          "MFQ^M07",
          "MFQ^M14",
          "ORU^R31",
          "ORU^R32",
          "PIN^I07",
          "QRY^T12",
          "QSX^J02",
          "RQC^I06",
          "RQI^I02",
          "RQI^I03",
          "RSP^K22",
          "RSP^K24",
        ].map((key) => [key, messageStructureByEvent.get(key)]),
      ),
    ).toStrictEqual({
      "ADT^A28": "ADT_A05",
      "ADT^A31": "ADT_A05",
      "ADT^A44": "ADT_A43",
      "ADT^A55": "ADT_A52",
      "MFN^M14": "MFN_Znn",
      "MFQ^M07": "MFQ_M01",
      "MFQ^M14": "MFQ_M01",
      "ORU^R31": "ORU_R30",
      "ORU^R32": "ORU_R30",
      "PIN^I07": "RQI_I01",
      "QRY^T12": "QRY",
      "QSX^J02": "QCN_J01",
      "RQC^I06": "RQC_I05",
      "RQI^I02": "RQI_I01",
      "RQI^I03": "RQI_I01",
      "RSP^K22": "RSP_K21",
      "RSP^K24": "RSP_K23",
    });
  });

  it("has no entry for an event whose structure 2.5.1 does not define", () => {
    for (const key of ["ORU^W01", "ORL^O40", "RSP^Z82"]) {
      expect(messageStructureByEvent.has(key), key).toBe(false);
    }
    expect(messageStructureByEvent.get("ADT^A44")).not.toBe("ADT_A44");
    expect(messageStructureByEvent.get("ORU^R31")).not.toBe("ORU_R31");
  });
});

describe("table 0354 corrections", () => {
  it("leaves out the typos of the THO data", () => {
    for (const typo of ["BRP_030", "RPI_I0I", "RQI_I0I"]) {
      expect(table("0354").codes.has(typo), typo).toBe(false);
    }
    for (const code of ["BRP_O30", "RPI_I01", "RQI_I01"]) {
      expect(table("0354").codes.has(code), code).toBe(true);
    }
  });

  it("lists the structure codes that 2.5.1 assigns although THO does not", () => {
    expect(table("0354").codes.has("MFN_Znn")).toBe(true);
    expect(table("0354").codes.has("QRY")).toBe(true);
  });
});
