import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { err, ok } from "../../src/shared/result";

describe("ok", () => {
  it("creates a successful result holding the value", () => {
    expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  });

  it("keeps falsy values instead of treating them as missing", () => {
    expect(ok(undefined)).toStrictEqual({ ok: true, value: undefined });
    expect(ok(0)).toStrictEqual({ ok: true, value: 0 });
    expect(ok("")).toStrictEqual({ ok: true, value: "" });
  });

  propertyTest.prop([fc.anything()])(
    "returns the identical value for any input",
    (value) => {
      const result = ok(value);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(value);
    },
  );
});

describe("err", () => {
  it("creates a failed result holding the error", () => {
    expect(err({ code: "EMPTY_INPUT" })).toStrictEqual({
      ok: false,
      error: { code: "EMPTY_INPUT" },
    });
  });

  propertyTest.prop([fc.anything()])(
    "returns the identical error for any input",
    (error) => {
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    },
  );
});
