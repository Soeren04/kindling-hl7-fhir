import { describe, expect, it } from "vitest";

import {
  component,
  composite,
  field,
  primitive,
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
