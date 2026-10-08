import { describe, expectTypeOf, it } from "vitest";

import type { Err, Ok, Result } from "../../src/index";
import { err, ok } from "../../src/shared/result";

describe("Result", () => {
  it("narrows to Ok or Err on the ok discriminant", () => {
    const narrow = (result: Result<number, "EMPTY">): number | "EMPTY" => {
      if (result.ok) {
        expectTypeOf(result).toEqualTypeOf<Ok<number>>();
        return result.value;
      }
      expectTypeOf(result).toEqualTypeOf<Err<"EMPTY">>();
      return result.error;
    };
    expectTypeOf(narrow).returns.toEqualTypeOf<number | "EMPTY">();
  });

  it("has readonly properties", () => {
    const result: Result<number, string> = ok(1);
    // @ts-expect-error -- results are immutable
    result.ok = false;
  });

  it("does not expose value on a failed result without narrowing", () => {
    const result: Result<number, string> = err("failure");
    // @ts-expect-error -- value only exists after narrowing to Ok
    expectTypeOf(result.value).toBeNumber();
  });
});

describe("ok and err", () => {
  it("infer the narrowest variant", () => {
    expectTypeOf(ok(1)).toEqualTypeOf<Ok<number>>();
    expectTypeOf(err("failure" as const)).toEqualTypeOf<Err<"failure">>();
  });

  it("are assignable to Result", () => {
    expectTypeOf(ok(1)).toExtend<Result<number, string>>();
    expectTypeOf(err("failure")).toExtend<Result<number, string>>();
  });
});
