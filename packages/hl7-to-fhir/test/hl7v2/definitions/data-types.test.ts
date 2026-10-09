import { describe, expect, it } from "vitest";

import { dataTypes } from "../../../src/hl7v2/definitions/data-types";
import type {
  CompositeDataType,
  DataTypeDefinition,
} from "../../../src/hl7v2/definitions/types";

const compositeTypes = [...dataTypes.values()].filter(
  (type): type is CompositeDataType => type.kind === "composite",
);

/** The composite type with the given identifier; fails the test when it is missing or not composite. */
function composite(id: string): CompositeDataType {
  const type = dataTypes.get(id);
  if (type?.kind !== "composite") {
    throw new Error(`${id} is not a composite data type`);
  }
  return type;
}

/** `name:type` of every component, to compare whole tables at once. */
function summarize(id: string): string[] {
  return composite(id).components.map(
    ({ name, dataType }) => `${name}:${dataType}`,
  );
}

describe("data type definitions", () => {
  it("are keyed by their own identifier", () => {
    for (const [key, type] of dataTypes) {
      expect(type.id).toBe(key);
    }
  });

  it.each(compositeTypes.map((type) => [type.id, type] as const))(
    "number the components of %s from 1 without gaps",
    (_id, type) => {
      expect(type.components.map(({ position }) => position)).toStrictEqual(
        type.components.map((_, index) => index + 1),
      );
      expect(type.components.length).toBeGreaterThan(0);
    },
  );

  it.each(compositeTypes.map((type) => [type.id, type] as const))(
    "give the components of %s unique identifier-style names",
    (_id, type) => {
      const names = type.components.map(({ name }) => name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(/^[a-z][A-Za-z0-9]*$/);
      }
    },
  );

  it("only reference data types that are defined", () => {
    const referenced = compositeTypes.flatMap(({ components }) =>
      components.map(({ dataType }) => dataType),
    );
    expect(referenced.filter((id) => !dataTypes.has(id))).toStrictEqual([]);
  });

  it("never contain themselves", () => {
    function reaches(id: string, target: string, seen: Set<string>): boolean {
      const type: DataTypeDefinition | undefined = dataTypes.get(id);
      if (type?.kind !== "composite" || seen.has(id)) return false;
      seen.add(id);
      return type.components.some(
        ({ dataType }) =>
          dataType === target || reaches(dataType, target, seen),
      );
    }
    expect(
      compositeTypes.filter(({ id }) => reaches(id, id, new Set())),
    ).toStrictEqual([]);
  });

  it("use four-digit table numbers", () => {
    const tables = compositeTypes.flatMap(({ components }) =>
      components.flatMap(({ table }) => (table === undefined ? [] : [table])),
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table).toMatch(/^\d{4}$/);
    }
  });

  it("define the types the plan names", () => {
    for (const id of [
      "XPN",
      "CX",
      "XAD",
      "XTN",
      "CWE",
      "CE",
      "HD",
      "PL",
      "XCN",
      "TS",
      "DTM",
      "EI",
      "VID",
      "MSG",
      "PT",
      "CQ",
      "SN",
    ]) {
      expect(dataTypes.has(id), id).toBe(true);
    }
  });
});

describe("well-known data types", () => {
  it("builds MSG from the message code, trigger event and structure, each with its table", () => {
    expect(composite("MSG").components).toStrictEqual([
      { position: 1, name: "messageCode", dataType: "ID", table: "0076" },
      { position: 2, name: "triggerEvent", dataType: "ID", table: "0003" },
      { position: 3, name: "messageStructure", dataType: "ID", table: "0354" },
    ]);
  });

  it("starts XPN with a family name made of subcomponents", () => {
    expect(summarize("XPN").slice(0, 3)).toStrictEqual([
      "familyName:FN",
      "givenName:ST",
      "secondAndFurtherGivenNames:ST",
    ]);
    expect(summarize("FN")[0]).toBe("surname:ST");
  });

  it("puts the identifier type of CX in component 5 and the authority in 4", () => {
    expect(composite("CX").components[3]).toMatchObject({
      name: "assigningAuthority",
      dataType: "HD",
    });
    expect(composite("CX").components[4]).toMatchObject({
      name: "identifierTypeCode",
      table: "0203",
    });
  });

  it("describes a coded element with six components in CE and nine in CWE", () => {
    expect(composite("CE").components).toHaveLength(6);
    expect(composite("CWE").components).toHaveLength(9);
    expect(summarize("CE")).toStrictEqual(summarize("CWE").slice(0, 6));
  });

  it("describes HD, VID, PT, CQ and SN as the standard names them", () => {
    expect(summarize("HD")).toStrictEqual([
      "namespaceId:IS",
      "universalId:ST",
      "universalIdType:ID",
    ]);
    expect(summarize("VID")[0]).toBe("versionId:ID");
    expect(summarize("PT")).toStrictEqual([
      "processingId:ID",
      "processingMode:ID",
    ]);
    expect(summarize("CQ")).toStrictEqual(["quantity:NM", "units:CE"]);
    expect(summarize("SN")).toStrictEqual([
      "comparator:ST",
      "num1:NM",
      "separatorSuffix:ST",
      "num2:NM",
    ]);
  });

  it("defines TS as a time with a degree of precision", () => {
    expect(summarize("TS")).toStrictEqual(["time:DTM", "degreeOfPrecision:ID"]);
  });

  it("gives PL the 11 components of 2.5.1, ending in the location identifier and its authority", () => {
    expect(summarize("PL")).toStrictEqual([
      "pointOfCare:IS",
      "room:IS",
      "bed:IS",
      "facility:HD",
      "locationStatus:IS",
      "personLocationType:IS",
      "building:IS",
      "floor:IS",
      "locationDescription:ST",
      "comprehensiveLocationIdentifier:EI",
      "assigningAuthorityForLocation:HD",
    ]);
  });

  it("makes the specimen source SPS of coded elements with exceptions", () => {
    expect(summarize("SPS")).toStrictEqual([
      "specimenSourceNameOrCode:CWE",
      "additives:CWE",
      "specimenCollectionMethod:TX",
      "bodySite:CWE",
      "siteModifier:CWE",
      "collectionMethodModifierCode:CWE",
      "specimenRole:CWE",
    ]);
    expect(composite("SPS").components.map(({ table }) => table)).toStrictEqual(
      [undefined, "0371", undefined, "0163", "0495", undefined, "0369"],
    );
  });

  it("types the telephone number of XTN as text, not as a TN", () => {
    expect(composite("XTN").components[0]).toStrictEqual({
      position: 1,
      name: "telephoneNumber",
      dataType: "ST",
    });
    expect(dataTypes.has("TN")).toBe(false);
  });

  it("assigns the 2.5.1 tables to the coded components", () => {
    const tableOf = (id: string, position: number) =>
      composite(id).components[position - 1]?.table;
    expect([
      tableOf("PL", 1),
      tableOf("PL", 2),
      tableOf("PL", 3),
      tableOf("PL", 7),
      tableOf("PL", 8),
      tableOf("XPN", 6),
      tableOf("XPN", 9),
      tableOf("XCN", 7),
      tableOf("XCN", 8),
      tableOf("XCN", 9),
      tableOf("XCN", 16),
      tableOf("EI", 2),
      tableOf("CX", 4),
      tableOf("XON", 6),
      tableOf("TS", 2),
      tableOf("TQ", 9),
      tableOf("OSD", 1),
      tableOf("VID", 2),
    ]).toStrictEqual([
      "0302",
      "0303",
      "0304",
      "0307",
      "0308",
      "0360",
      "0448",
      "0360",
      "0297",
      "0363",
      "0448",
      "0363",
      "0363",
      "0363",
      "0529",
      "0472",
      "0524",
      "0399",
    ]);
  });

  it("numbers the location and name components of NDL and CNN with their tables", () => {
    expect(
      composite("NDL")
        .components.slice(3)
        .map(({ table }) => table),
    ).toStrictEqual([
      "0302",
      "0303",
      "0304",
      undefined,
      "0306",
      "0305",
      "0307",
      "0308",
    ]);
    expect(
      composite("CNN")
        .components.slice(6)
        .map(({ table }) => table),
    ).toStrictEqual(["0360", "0297", "0363", undefined, "0301"]);
  });

  it("keeps the placeholder for fields whose type varies", () => {
    expect(dataTypes.get("varies")).toStrictEqual({
      kind: "varies",
      id: "varies",
    });
  });

  it("keeps primitive types free of components", () => {
    expect(dataTypes.get("ST")).toStrictEqual({ kind: "primitive", id: "ST" });
  });
});
