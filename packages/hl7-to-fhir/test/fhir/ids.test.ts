import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUrlSource,
  isUuid,
  randomId,
  sequentialIds,
} from "../../src/fhir/ids";
import type { SegmentAt } from "../../src/fhir/resources/segment";
import { parsed } from "../hl7v2/helpers";

const version4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u;

const pid: SegmentAt = {
  segment: (() => {
    const segment = parsed("MSH|^~\\&\rPID|1").message.segments[1];
    if (segment === undefined) throw new Error("expected a PID");
    return segment;
  })(),
  segmentIndex: 1,
};

describe("sequentialIds", () => {
  it("makes lowercase UUIDs from the prefix and the position", () => {
    const ids = sequentialIds("test");
    const made = [0, 1, 2].map((index) => ids(index));
    expect(made.every(isUuid)).toBe(true);
    expect(new Set(made).size).toBe(3);
    expect(made[1]?.slice(-12)).toBe("000000000002");
  });

  it("makes the same ids for the same prefix and other ids for another", () => {
    expect(sequentialIds("a")(0)).toBe(sequentialIds("a")(0));
    expect(sequentialIds("a")(0)).not.toBe(sequentialIds("b")(0));
  });

  it("depends on nothing but its arguments", () => {
    const ids = sequentialIds("test");
    expect(ids(5)).toBe(ids(5));
  });
});

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a random version 4 UUID", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(version4);
  });

  it("builds the UUID from getRandomValues where randomUUID is missing", () => {
    const getRandomValues = <T extends Uint8Array>(array: T): T => {
      array.fill(0xff);
      return array;
    };
    vi.stubGlobal("crypto", { getRandomValues });
    expect(randomId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});

describe("createUrlSource", () => {
  it("makes urn:uuid: fullUrls, passing the position of each resource", () => {
    const positions: number[] = [];
    const urls = createUrlSource((index) => {
      positions.push(index);
      return sequentialIds("x")(index);
    });
    expect([urls.next(pid), urls.next(pid)]).toStrictEqual([
      `urn:uuid:${sequentialIds("x")(0)}`,
      `urn:uuid:${sequentialIds("x")(1)}`,
    ]);
    expect(positions).toStrictEqual([0, 1]);
    expect(urls.failure()).toBeUndefined();
  });

  it("records what a generator throws and calls it no more", () => {
    const thrown = new Error("no ids today");
    const generate = vi.fn(() => {
      throw thrown;
    });
    const urls = createUrlSource(generate);
    urls.next(pid);
    urls.next(pid);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(urls.failure()).toStrictEqual({
      hook: "ids",
      location: { span: pid.segment.span, segmentIndex: 1, segmentId: "PID" },
      cause: thrown,
    });
  });

  it("lowers the letters of an upper-case UUID", () => {
    const urls = createUrlSource((index) =>
      index === 0
        ? "6F1C2E3A-0B4D-4E5F-8A6B-7C8D9E0F1A2B"
        : "6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2c",
    );
    expect([urls.next(pid), urls.next(pid)]).toStrictEqual([
      "urn:uuid:6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2b",
      "urn:uuid:6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2c",
    ]);
    expect(urls.failure()).toBeUndefined();
  });

  it.each([
    ["no string", () => 42],
    ["no UUID", () => "patient-1"],
    ["a UUID without hyphens", () => "6f1c2e3a0b4d4e5f8a6b7c8d9e0f1a2b"],
    ["the same id twice", () => "6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2b"],
    [
      "the same id twice, once in upper case",
      (index: number) =>
        index === 0
          ? "6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2b"
          : "6F1C2E3A-0B4D-4E5F-8A6B-7C8D9E0F1A2B",
    ],
  ])(
    "fails for a generator that returns %s, naming the rule",
    (_, generate) => {
      const urls = createUrlSource(generate);
      urls.next(pid);
      urls.next(pid);
      const cause = urls.failure()?.cause;
      expect(cause).toBeInstanceOf(TypeError);
      expect(cause).toHaveProperty(
        "message",
        expect.stringMatching(/UUID.*8, 4, 4, 4 and 12.*new one/u),
      );
    },
  );
});
