import { describe, expectTypeOf, it } from "vitest";

import { get, getAll, isNull } from "../../src/hl7v2/access";
import type { Hl7Message } from "../../src/hl7v2/model";
import type { Hl7Path } from "../../src/hl7v2/path-type";

declare const message: Hl7Message;
declare const anyString: string;

describe("Hl7Path", () => {
  it("is a plain string without a type argument", () => {
    expectTypeOf<Hl7Path>().toEqualTypeOf<string>();
  });

  it("keeps a valid literal as it is", () => {
    expectTypeOf<Hl7Path<"PID.5">>().toEqualTypeOf<"PID.5">();
    expectTypeOf<Hl7Path<"PID.5.1.2">>().toEqualTypeOf<"PID.5.1.2">();
    expectTypeOf<Hl7Path<"PID.3[2].1">>().toEqualTypeOf<"PID.3[2].1">();
    expectTypeOf<Hl7Path<"OBX[10].5[3]">>().toEqualTypeOf<"OBX[10].5[3]">();
    expectTypeOf<Hl7Path<"Z01.12">>().toEqualTypeOf<"Z01.12">();
    expectTypeOf<Hl7Path<"MSH.1" | "MSH.2">>().toEqualTypeOf<
      "MSH.1" | "MSH.2"
    >();
  });

  it("replaces a malformed literal with an explanation", () => {
    expectTypeOf<
      Hl7Path<"PID..5">
    >().toEqualTypeOf<"Invalid HL7 path: a field is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.x">
    >().toEqualTypeOf<"Invalid HL7 path: a field is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.05">
    >().toEqualTypeOf<"Invalid HL7 path: a field is a positive number without leading zeros">();
    expectTypeOf<
      Hl7Path<"PID">
    >().toEqualTypeOf<"Invalid HL7 path: a field number must follow the segment, as in PID.5">();
    expectTypeOf<
      Hl7Path<"pid.5">
    >().toEqualTypeOf<"Invalid HL7 path: the segment identifier must be upper case">();
    expectTypeOf<
      Hl7Path<"PI.5">
    >().toEqualTypeOf<"Invalid HL7 path: the segment identifier has three characters">();
    expectTypeOf<
      Hl7Path<"OBX[a].5">
    >().toEqualTypeOf<"Invalid HL7 path: a repetition index is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.5.x">
    >().toEqualTypeOf<"Invalid HL7 path: a component is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.5.1.x">
    >().toEqualTypeOf<"Invalid HL7 path: a subcomponent is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.5.1[2]">
    >().toEqualTypeOf<"Invalid HL7 path: a component is a positive number">();
    expectTypeOf<
      Hl7Path<"PID.5.1.1.1">
    >().toEqualTypeOf<"Invalid HL7 path: a subcomponent is a positive number">();
  });

  it("accepts strings that are not literals", () => {
    expectTypeOf<Hl7Path<`PID.${string}`>>().toEqualTypeOf<`PID.${string}`>();
    expectTypeOf<Hl7Path<`${string}.5`>>().toEqualTypeOf<`${string}.5`>();
  });
});

describe("get, getAll and isNull", () => {
  it("accept valid literals and any string variable", () => {
    expectTypeOf(get(message, "PID.5.1")).toEqualTypeOf<string | undefined>();
    expectTypeOf(get(message, "OBX[3].5[2].1.1")).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(get(message, anyString)).toEqualTypeOf<string | undefined>();
    expectTypeOf(getAll(message, "PID.3.1")).toEqualTypeOf<readonly string[]>();
    expectTypeOf(getAll(message, anyString)).toEqualTypeOf<readonly string[]>();
    expectTypeOf(isNull(message, "PID.8")).toEqualTypeOf<boolean>();
    expectTypeOf(isNull(message, `PID.${anyString}`)).toEqualTypeOf<boolean>();
  });

  it("reject malformed literals at compile time", () => {
    // @ts-expect-error -- an empty field part
    get(message, "PID..5");
    // @ts-expect-error -- a field number must be numeric
    get(message, "PID.x");
    // @ts-expect-error -- a segment alone names no field
    get(message, "PID");
    // @ts-expect-error -- field numbers start at 1
    getAll(message, "PID.0");
    // @ts-expect-error -- segment identifiers are upper case
    isNull(message, "pid.5");
    // @ts-expect-error -- components take no repetition index
    get(message, "PID.5.1[2]");
    // @ts-expect-error -- the repetition index must be numeric
    getAll(message, "PID.3[all]");
    // @ts-expect-error -- a trailing dot
    get(message, "PID.5.");
    // @ts-expect-error -- paths are strings
    get(message, 5);
  });

  it("need a message", () => {
    // @ts-expect-error -- the first argument is the message, not the text
    get("MSH|^~\\&|A", "MSH.3");
  });
});
