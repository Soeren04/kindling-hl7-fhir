import { describe, expect, it } from "vitest";

import { textAt } from "../../src/fhir/context";
import {
  fieldValue,
  fieldValues,
  isNullValue,
  leaf,
  part,
} from "../../src/fhir/source";
import { parsed } from "../hl7v2/helpers";
import { mapping } from "./helpers";

describe("fieldValues", () => {
  const input =
    "MSH|^~\\&|A\rPID|1||111^^^HOSP&2.16.840.1&ISO~222||Everyman^Adam";
  const { message } = parsed(input);
  const pid = message.segments[1];

  it("locates every repetition of a field", () => {
    if (pid === undefined) expect.fail("expected PID");
    const values = fieldValues(pid, 1, 3);
    expect(values.map(({ location }) => location)).toStrictEqual([
      {
        span: { start: input.indexOf("111"), end: input.indexOf("~222") },
        segmentIndex: 1,
        segmentId: "PID",
        field: 3,
        repetition: 1,
      },
      {
        span: { start: input.indexOf("222"), end: input.indexOf("||Ever") },
        segmentIndex: 1,
        segmentId: "PID",
        field: 3,
        repetition: 2,
      },
    ]);
  });

  it("returns nothing for an empty or absent field", () => {
    if (pid === undefined) expect.fail("expected PID");
    expect(fieldValues(pid, 1, 2)).toStrictEqual([]);
    expect(fieldValues(pid, 1, 30)).toStrictEqual([]);
    expect(fieldValue(pid, 1, 30)).toBeUndefined();
  });

  it("leaves an invalid segment identifier out of the location", () => {
    const { message: lower } = parsed("MSH|^~\\&|A\rpid|1");
    const segment = lower.segments[1];
    if (segment === undefined) expect.fail("expected a segment");
    expect(fieldValue(segment, 1, 1)?.location).not.toHaveProperty("segmentId");
  });
});

describe("part", () => {
  const { field, input } = mapping("PID|1||111^^^HOSP&2.16.840.1&ISO");
  const cx = field(3);

  it("goes from a repetition to a component and from a component to a subcomponent", () => {
    const authority = part(cx, 4);
    expect(authority?.location).toMatchObject({ field: 3, component: 4 });
    const universalId = part(authority, 2);
    expect(universalId?.location).toMatchObject({
      field: 3,
      component: 4,
      subcomponent: 2,
    });
    const span = universalId?.location.span;
    expect(input.slice(span?.start, span?.end)).toBe("2.16.840.1");
    expect(leaf(universalId)).toMatchObject({ value: "2.16.840.1" });
  });

  it("treats a subcomponent as its own first and only part", () => {
    const universalId = part(part(cx, 4), 2);
    expect(part(universalId, 1)).toBe(universalId);
    expect(part(universalId, 2)).toBeUndefined();
  });

  it("returns nothing beyond the last part or for no value", () => {
    expect(part(cx, 9)).toBeUndefined();
    expect(part(undefined, 1)).toBeUndefined();
    expect(leaf(undefined)).toBeUndefined();
  });
});

describe("isNullValue", () => {
  const { field, context } = mapping('PID|1||""||""^Adam|""&x');

  it("is true for a value that is the explicit null and nothing else", () => {
    const whole = field(3);
    if (whole === undefined) expect.fail("expected PID-3");
    expect(isNullValue(whole)).toBe(true);
    const component = part(field(5), 1);
    if (component === undefined) expect.fail("expected PID-5.1");
    expect(isNullValue(component)).toBe(true);
    const subcomponent = part(part(field(6), 1), 1);
    if (subcomponent === undefined) expect.fail("expected PID-6.1.1");
    expect(isNullValue(subcomponent)).toBe(true);
  });

  it("is false when other parts hold something", () => {
    const name = field(5);
    if (name === undefined) expect.fail("expected PID-5");
    expect(isNullValue(name)).toBe(false);
    const component = part(field(6), 1);
    if (component === undefined) expect.fail("expected PID-6.1");
    expect(isNullValue(component)).toBe(false);
  });

  it("reads nulls inside a value as no text", () => {
    expect(textAt(context, field(5), 1)).toBeUndefined();
    expect(textAt(context, field(5), 2)).toBe("Adam");
  });
});
