import { describe, expectTypeOf, it } from "vitest";

import {
  err,
  type Err,
  ok,
  type Ok,
  type Result,
} from "../../src/shared/result";

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
    const freeze = (result: Result<number, string>): void => {
      // @ts-expect-error -- results are immutable
      result.ok = false;
    };
    expectTypeOf(freeze).toBeFunction();
  });

  it("does not expose value on a result that is not narrowed", () => {
    const read = (result: Result<number, string>): unknown =>
      // @ts-expect-error -- value only exists after narrowing to Ok
      result.value;
    expectTypeOf(read).toBeFunction();
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
