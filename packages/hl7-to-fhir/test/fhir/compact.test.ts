import { describe, expect, expectTypeOf, it } from "vitest";

import { compact } from "../../src/fhir/compact";

describe("compact", () => {
  it("leaves out the properties that are undefined, and only those", () => {
    const result = compact({ a: 1, b: undefined, c: "", d: null, e: 0 });
    expect(result).toStrictEqual({ a: 1, c: "", d: null, e: 0 });
    expect(result).not.toHaveProperty("b");
  });

  it("makes only the properties that may be undefined optional", () => {
    const result = compact({
      kept: "x",
      maybe: Math.random() > 2 ? 1 : undefined,
    });
    expectTypeOf(result).toEqualTypeOf<{ kept: string } & { maybe?: number }>();
  });
});
