import { describe, expectTypeOf, it } from "vitest";

import type {
  Delimiters,
  Field,
  Hl7Message,
  Segment,
  Subcomponent,
} from "../../src/hl7v2/model";

describe("Subcomponent", () => {
  it("narrows on kind, and only values carry text", () => {
    const text = (subcomponent: Subcomponent): string | undefined => {
      switch (subcomponent.kind) {
        case "value":
          return subcomponent.value;
        case "null":
        case "empty":
          expectTypeOf(subcomponent).not.toHaveProperty("value");
          return undefined;
      }
    };
    expectTypeOf(text).returns.toEqualTypeOf<string | undefined>();
  });
});

describe("message tree", () => {
  it("is immutable at every level", () => {
    const mutate = (message: Hl7Message, segment: Segment, field: Field) => {
      // @ts-expect-error -- segments cannot be replaced
      message.segments = [];
      // @ts-expect-error -- the segment list is readonly
      message.segments[0] = segment;
      // @ts-expect-error -- the field list is readonly
      segment.fields[0] = field;
      // @ts-expect-error -- the repetition list is readonly
      field.repetitions.length = 0;
    };
    expectTypeOf(mutate).toBeFunction();
  });

  it("makes the version and the truncation character optional", () => {
    expectTypeOf<Hl7Message["version"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Delimiters["truncation"]>().toEqualTypeOf<
      string | undefined
    >();
  });
});
