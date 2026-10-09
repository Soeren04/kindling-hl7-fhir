import { describe, expect, it } from "vitest";

import {
  component,
  composite,
  field,
  group,
  primitive,
  segment,
} from "../../../src/hl7v2/definitions/define";

describe("field", () => {
  it("defaults to an optional field that occurs once", () => {
    expect(field(1, "setId", "SI")).toStrictEqual({
      position: 1,
      name: "setId",
      dataType: "SI",
      optionality: "O",
      maxRepetitions: 1,
    });
  });

  it("turns `repeats: true` into an unbounded field", () => {
    expect(
      field(3, "patientIdentifierList", "CX", "R", { repeats: true }),
    ).toMatchObject({ optionality: "R", maxRepetitions: "unbounded" });
  });

  it("keeps a numeric maximum", () => {
    expect(
      field(14, "callBackPhoneNumber", "XTN", "O", { repeats: 2 }),
    ).toMatchObject({ maxRepetitions: 2 });
  });

  it("adds the table only when there is one", () => {
    expect(
      field(8, "administrativeSex", "IS", "O", { table: "0001" }),
    ).toHaveProperty("table", "0001");
    expect(field(1, "setId", "SI")).not.toHaveProperty("table");
  });
});

describe("component", () => {
  it("adds the table only when there is one", () => {
    expect(component(1, "messageCode", "ID", "0076")).toStrictEqual({
      position: 1,
      name: "messageCode",
      dataType: "ID",
      table: "0076",
    });
    expect(component(2, "text", "ST")).toStrictEqual({
      position: 2,
      name: "text",
      dataType: "ST",
    });
  });
});

describe("data type builders", () => {
  it("builds primitive and composite types", () => {
    expect(primitive("ST")).toStrictEqual({ kind: "primitive", id: "ST" });
    expect(composite("HD", [component(1, "namespaceId", "IS")])).toStrictEqual({
      kind: "composite",
      id: "HD",
      components: [{ position: 1, name: "namespaceId", dataType: "IS" }],
    });
  });
});

describe("segment", () => {
  it.each([
    ["required", 1, 1],
    ["optional", 0, 1],
    ["repeating", 1, "unbounded"],
    ["optionalRepeating", 0, "unbounded"],
  ] as const)("reads %s as min %s and max %s", (occurrence, min, max) => {
    expect(segment("NK1", occurrence)).toStrictEqual({
      kind: "segment",
      id: "NK1",
      min,
      max,
    });
  });
});

describe("group", () => {
  it("keeps the elements in order next to the cardinality", () => {
    const pr1 = segment("PR1", "required");
    const rol = segment("ROL", "optionalRepeating");
    expect(group("PROCEDURE", "optionalRepeating", [pr1, rol])).toStrictEqual({
      kind: "group",
      name: "PROCEDURE",
      min: 0,
      max: "unbounded",
      elements: [pr1, rol],
    });
  });
});
