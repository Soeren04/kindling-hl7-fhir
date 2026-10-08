import { describe, expect, it } from "vitest";

import { parsePath, type PathErrorCode } from "../../src/hl7v2/path";

describe("parsePath", () => {
  it.each([
    [
      "PID.5",
      {
        segment: "PID",
        segmentIndex: undefined,
        field: 5,
        fieldIndex: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "PID.5.1",
      {
        segment: "PID",
        segmentIndex: undefined,
        field: 5,
        fieldIndex: undefined,
        component: 1,
        subcomponent: undefined,
      },
    ],
    [
      "PID.3[2].4.2",
      {
        segment: "PID",
        segmentIndex: undefined,
        field: 3,
        fieldIndex: 2,
        component: 4,
        subcomponent: 2,
      },
    ],
    [
      "OBX[3].5",
      {
        segment: "OBX",
        segmentIndex: 3,
        field: 5,
        fieldIndex: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "ZPI[12].10[11].20.30",
      {
        segment: "ZPI",
        segmentIndex: 12,
        field: 10,
        fieldIndex: 11,
        component: 20,
        subcomponent: 30,
      },
    ],
    [
      "MSH.2",
      {
        segment: "MSH",
        segmentIndex: undefined,
        field: 2,
        fieldIndex: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "Q99.1",
      {
        segment: "Q99",
        segmentIndex: undefined,
        field: 1,
        fieldIndex: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
  ])("reads %s", (path, expected) => {
    expect(parsePath(path)).toStrictEqual({ ok: true, value: expected });
  });

  it.each<[string, string, PathErrorCode, number, number]>([
    ["the empty path", "", "EMPTY_PATH", 0, 0],
    ["a lower-case segment", "pid.5", "INVALID_SEGMENT_ID", 0, 3],
    ["a short segment", "PI.5", "INVALID_SEGMENT_ID", 0, 2],
    ["a segment starting with a digit", "1ID.5", "INVALID_SEGMENT_ID", 0, 3],
    ["an empty segment", ".5", "INVALID_SEGMENT_ID", 0, 0],
    ["a segment alone", "PID", "MISSING_FIELD", 3, 3],
    ["a segment with an index alone", "OBX[3]", "MISSING_FIELD", 6, 6],
    ["an empty field", "PID.", "INVALID_NUMBER", 4, 4],
    ["an empty part", "PID..5", "INVALID_NUMBER", 4, 4],
    ["a non-numeric field", "PID.x", "INVALID_NUMBER", 4, 5],
    ["field zero", "PID.0", "INVALID_NUMBER", 4, 5],
    ["a leading zero", "PID.05", "INVALID_NUMBER", 4, 6],
    ["a negative number", "PID.-1", "INVALID_NUMBER", 4, 6],
    [
      "a number beyond the safe integers",
      `PID.${"9".repeat(20)}`,
      "INVALID_NUMBER",
      4,
      24,
    ],
    ["a non-numeric component", "PID.5.a", "INVALID_NUMBER", 6, 7],
    ["a non-numeric subcomponent", "PID.5.1.a", "INVALID_NUMBER", 8, 9],
    ["a trailing dot", "PID.5.", "INVALID_NUMBER", 6, 6],
    ["an index on a component", "PID.5.1[2]", "INVALID_NUMBER", 6, 10],
    ["an index on a subcomponent", "PID.5.1.1[2]", "INVALID_NUMBER", 8, 12],
    ["more than four parts", "PID.5.1.1.1.1", "TOO_MANY_PARTS", 10, 13],
    ["surrounding whitespace", " PID.5", "INVALID_SEGMENT_ID", 0, 4],
    ["an index of zero", "OBX[0].5", "INVALID_INDEX", 0, 6],
    ["a non-numeric index", "OBX[a].5", "INVALID_INDEX", 0, 6],
    ["an empty index", "PID.3[].1", "INVALID_INDEX", 4, 7],
    ["an unclosed index", "PID.3[2.1", "INVALID_INDEX", 4, 7],
    ["a stray closing bracket", "PID].3", "INVALID_INDEX", 0, 4],
    ["text after the index", "PID.3[2]x", "INVALID_INDEX", 4, 9],
    ["a nested index", "PID.3[[2]]", "INVALID_INDEX", 4, 10],
  ])("rejects %s", (_description, path, code, start, end) => {
    const result = parsePath(path);
    expect(result).toMatchObject({
      ok: false,
      error: { code, span: { start, end } },
    });
  });

  it("does not echo the path in its messages", () => {
    const result = parsePath("Everyman.Adam");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toContain("Everyman");
  });
});
