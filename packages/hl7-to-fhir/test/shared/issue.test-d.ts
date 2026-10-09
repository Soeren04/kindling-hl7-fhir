import { describe, expectTypeOf, it } from "vitest";

import type {
  Issue,
  IssueCode,
  Location,
  Severity,
  Span,
} from "../../src/shared/issue";

describe("Issue", () => {
  it("requires code, severity, message and location, and makes value optional", () => {
    const minimal: Issue = {
      code: "EMPTY_INPUT",
      severity: "error",
      message: "The input is empty.",
      location: { span: { start: 0, end: 0 } },
    };
    expectTypeOf(minimal.location).toEqualTypeOf<Location>();
    expectTypeOf(minimal.value).toEqualTypeOf<string | undefined>();
    // @ts-expect-error -- every issue has a location
    const nowhere: Issue = {
      code: "EMPTY_INPUT",
      severity: "error",
      message: "",
    };
    expectTypeOf(nowhere).toEqualTypeOf<Issue>();
  });

  it("accepts only known codes and severities", () => {
    expectTypeOf<"EMPTY_INPUT">().toExtend<IssueCode>();
    expectTypeOf<"NOT_A_CODE">().not.toExtend<IssueCode>();
    expectTypeOf<Severity>().toEqualTypeOf<"error" | "warning" | "info">();
  });

  it("is immutable", () => {
    const mutate = (issue: Issue, location: Location, span: Span): void => {
      // @ts-expect-error -- issues are immutable
      issue.message = "";
      // @ts-expect-error -- locations are immutable
      location.field = 1;
      // @ts-expect-error -- spans are immutable
      span.start = 0;
    };
    expectTypeOf(mutate).toBeFunction();
  });
});

describe("Location", () => {
  it("requires a span and nothing else", () => {
    const inputLevel: Location = { span: { start: 0, end: 1 } };
    expectTypeOf(inputLevel.segmentIndex).toEqualTypeOf<number | undefined>();
    // @ts-expect-error -- every location points into the input
    const nowhere: Location = { segmentIndex: 0 };
    expectTypeOf(nowhere).toEqualTypeOf<Location>();
  });
});
