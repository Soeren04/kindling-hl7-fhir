import { describe, expect, it } from "vitest";

import { parsePath, type PathFailureCode } from "../../src/hl7v2/path";

describe("parsePath", () => {
  it.each([
    [
      "PID.5",
      {
        segmentId: "PID",
        segmentOccurrence: undefined,
        field: 5,
        repetition: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "PID.5.1",
      {
        segmentId: "PID",
        segmentOccurrence: undefined,
        field: 5,
        repetition: undefined,
        component: 1,
        subcomponent: undefined,
      },
    ],
    [
      "PID.3[2].4.2",
      {
        segmentId: "PID",
        segmentOccurrence: undefined,
        field: 3,
        repetition: 2,
        component: 4,
        subcomponent: 2,
      },
    ],
    [
      "OBX[3].5",
      {
        segmentId: "OBX",
        segmentOccurrence: 3,
        field: 5,
        repetition: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "ZPI[12].10[11].20.30",
      {
        segmentId: "ZPI",
        segmentOccurrence: 12,
        field: 10,
        repetition: 11,
        component: 20,
        subcomponent: 30,
      },
    ],
    [
      "MSH.2",
      {
        segmentId: "MSH",
        segmentOccurrence: undefined,
        field: 2,
        repetition: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
    [
      "Q99.1",
      {
        segmentId: "Q99",
        segmentOccurrence: undefined,
        field: 1,
        repetition: undefined,
        component: undefined,
        subcomponent: undefined,
      },
    ],
  ])("reads %s", (path, expected) => {
    expect(parsePath(path)).toStrictEqual({ ok: true, value: expected });
  });

  it.each<[string, string, PathFailureCode, number, number]>([
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

  describe("hostile paths", () => {
    // Each of these takes well under 100 ms; the bound is generous so that a slow machine does not fail the test, and
    // low enough that work proportional to the number of dots (seconds for five million) does.
    const budgetMs = 1000;

    function timed<T>(run: () => T): { result: T; ms: number } {
      const started = performance.now();
      const result = run();
      return { result, ms: performance.now() - started };
    }

    it("stops at the fifth part of a path with millions of dots", () => {
      const path = `PID${".".repeat(5_000_000)}`;
      const { result, ms } = timed(() => parsePath(path));
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "TOO_MANY_PARTS",
          span: { start: 7, end: path.length },
        },
      });
      expect(ms).toBeLessThan(budgetMs);
    });

    it("rejects a number of millions of digits", () => {
      const path = `PID.${"9".repeat(5_000_000)}`;
      const { result, ms } = timed(() => parsePath(path));
      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_NUMBER", span: { start: 4, end: path.length } },
      });
      expect(ms).toBeLessThan(budgetMs);
    });

    it("accepts the largest safe integer and rejects the next digit", () => {
      expect(parsePath(`PID.${String(Number.MAX_SAFE_INTEGER)}`)).toMatchObject(
        {
          ok: true,
          value: { field: Number.MAX_SAFE_INTEGER },
        },
      );
      expect(
        parsePath(`PID.${String(Number.MAX_SAFE_INTEGER)}0`),
      ).toMatchObject({
        ok: false,
        error: { code: "INVALID_NUMBER" },
      });
    });
  });

  it("does not echo the path in its messages", () => {
    const result = parsePath("Everyman.Adam");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toContain("Everyman");
  });

  it.each([undefined, null, 5])(
    "rejects %s with INVALID_INPUT instead of throwing",
    (path) => {
      expect(parsePath(path as unknown as string)).toStrictEqual({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "The path is not a string.",
          span: { start: 0, end: 0 },
        },
      });
    },
  );
});
