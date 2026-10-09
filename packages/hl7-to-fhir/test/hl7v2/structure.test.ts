import { describe, expect, it } from "vitest";

import { resolveStructure } from "../../src/hl7v2/structure";
import type { Issue } from "../../src/shared/issue";
import { parsed } from "./helpers";

/** Resolves the structure of a message whose MSH-9 is `messageType`. */
function resolve(messageType: string): {
  id: string | undefined;
  definition: string | undefined;
  issues: Issue[];
} {
  const { message } = parsed(
    `MSH|^~\\&|LAB|HOSP|||20240115103000||${messageType}|1|P|2.5.1\rPID|1`,
  );
  const issues: Issue[] = [];
  const { id, definition } = resolveStructure(message, issues);
  return { id, definition: definition?.id, issues };
}

describe("resolveStructure", () => {
  it("takes the structure from MSH-9.3", () => {
    expect(resolve("ORU^R01^ORU_R01")).toStrictEqual({
      id: "ORU_R01",
      definition: "ORU_R01",
      issues: [],
    });
  });

  it.each([
    ["ADT^A03^ADT_A01", "ADT_A01"],
    ["ADT^A04^ORU_R01", "ORU_R01"],
    ["ACK^A01^ADT_A01", "ADT_A01"],
  ])(
    "reports %s, whose MSH-9.3 contradicts the event, and follows MSH-9.3",
    (messageType, structure) => {
      const { id, definition, issues } = resolve(messageType);
      expect({ id, definition }).toStrictEqual({
        id: structure,
        definition: structure,
      });
      const start = 36 + messageType.lastIndexOf("^") + 1;
      expect(issues).toStrictEqual([
        expect.objectContaining({
          code: "MESSAGE_STRUCTURE_MISMATCH",
          severity: "error",
          value: structure,
          location: {
            span: { start, end: start + structure.length },
            segmentIndex: 0,
            segmentId: "MSH",
            field: 9,
            repetition: 1,
            component: 3,
          },
        }),
      ]);
    },
  );

  it.each([
    ["an event the map does not know", "ADT^Z99^ADT_A01"],
    ["a message code without event", "ADT^^ORU_R01"],
  ])("follows MSH-9.3 without complaint for %s", (_case, messageType) => {
    expect(resolve(messageType).issues).toStrictEqual([]);
  });

  it.each(["ACK", "ACK^A01", "ACK^R01^ACK"])(
    "resolves the acknowledgment %s to the structure ACK",
    (messageType) => {
      const { id, issues } = resolve(messageType);
      expect(id).toBe("ACK");
      expect(issues.map(({ code }) => code)).toStrictEqual([
        "MESSAGE_STRUCTURE_UNSUPPORTED",
      ]);
    },
  );

  it.each([
    ["ADT^A01", "ADT_A01"],
    ["ADT^A04", "ADT_A01"],
    ["ADT^A08", "ADT_A01"],
    ["ADT^A13", "ADT_A01"],
    ["ORU^R01", "ORU_R01"],
  ])(
    "finds the structure of %s through HL7 table 0354 without MSH-9.3",
    (messageType, structure) => {
      expect(resolve(messageType)).toStrictEqual({
        id: structure,
        definition: structure,
        issues: [],
      });
    },
  );

  it("treats an empty MSH-9.3 like a missing one", () => {
    expect(resolve("ADT^A04^").id).toBe("ADT_A01");
  });

  it("reports a structure the library has no definition of, located at MSH-9.3", () => {
    const { id, definition, issues } = resolve("ORM^O01^ORM_O01");
    expect({ id, definition }).toStrictEqual({
      id: "ORM_O01",
      definition: undefined,
    });
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "MESSAGE_STRUCTURE_UNSUPPORTED",
        severity: "info",
        value: "ORM_O01",
        location: {
          span: { start: 44, end: 51 },
          segmentIndex: 0,
          segmentId: "MSH",
          field: 9,
          repetition: 1,
          component: 3,
        },
      }),
    ]);
  });

  it("locates an unsupported structure found through the event at MSH-9", () => {
    const { issues } = resolve("ADT^A03");
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "MESSAGE_STRUCTURE_UNSUPPORTED",
        value: "ADT_A03",
        location: {
          span: { start: 36, end: 43 },
          segmentIndex: 0,
          segmentId: "MSH",
          field: 9,
        },
      }),
    ]);
  });

  it.each([
    ["an unknown event", "ADT^Z99"],
    ["a message code without event", "ADT"],
    ["an event without message code", "^A01"],
    ["the explicit null", '""'],
  ])("reports %s as an unknown structure", (_case, messageType) => {
    const { id, issues } = resolve(messageType);
    expect(id).toBeUndefined();
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "MESSAGE_STRUCTURE_UNKNOWN",
        severity: "warning",
        location: {
          span: { start: 36, end: 36 + messageType.length },
          segmentIndex: 0,
          segmentId: "MSH",
          field: 9,
        },
      }),
    ]);
    expect(issues[0]).not.toHaveProperty("value");
  });

  it("locates a missing MSH-9 at the end of the header", () => {
    const { message } = parsed("MSH|^~\\&|LAB");
    const issues: Issue[] = [];
    expect(resolveStructure(message, issues)).toStrictEqual({});
    expect(issues.map(({ code, location }) => [code, location])).toStrictEqual([
      [
        "MESSAGE_STRUCTURE_UNKNOWN",
        {
          span: { start: 12, end: 12 },
          segmentIndex: 0,
          segmentId: "MSH",
          field: 9,
        },
      ],
    ]);
  });

  it("resolves no structure for a tree whose first segment is not MSH", () => {
    const issues: Issue[] = [];
    const span = { start: 0, end: 5 };
    const message = {
      delimiters: { field: "|", component: "^", repetition: "~" },
      segments: [{ id: "PID", fields: [], span }],
    };
    expect(resolveStructure(message, issues)).toStrictEqual({});
    expect(issues.map(({ location }) => location)).toStrictEqual([
      { span: { start: 5, end: 5 } },
    ]);
  });

  it("resolves no structure for a tree without segments", () => {
    const issues: Issue[] = [];
    const delimiters = { field: "|", component: "^", repetition: "~" };
    resolveStructure({ delimiters, segments: [] }, issues);
    expect(issues.map(({ location }) => location)).toStrictEqual([
      { span: { start: 0, end: 0 } },
    ]);
  });
});
