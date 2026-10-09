import { describe, expect, it } from "vitest";

import { mapCode } from "../../../src/fhir/datatypes/code";
import { part } from "../../../src/fhir/source";
import { codes, mapping } from "../helpers";

const lookup = (code: string): string | undefined =>
  code === "A" ? "alpha" : undefined;

describe("mapCode", () => {
  it("maps a code the lookup knows, silently", () => {
    const { context, field, issues } = mapping("PID|1|A");
    expect(mapCode(context, field(2), lookup)).toBe("alpha");
    expect(issues).toStrictEqual([]);
  });

  it("reports a code the lookup does not know, at the code with the code as value", () => {
    const { context, field, issues } = mapping("PID|1|X");
    expect(mapCode(context, field(2), lookup)).toBeUndefined();
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "UNMAPPED_CODE",
        severity: "warning",
        value: "X",
        location: expect.objectContaining({ field: 2 }) as unknown,
      }),
    ]);
  });

  it("leaves out a code the guide lists as unmatched, silently", () => {
    const { context, field, issues } = mapping("PID|1|U");
    const unmatched = new Set(["U"]);
    expect(mapCode(context, field(2), lookup, { unmatched })).toBeUndefined();
    expect(issues).toStrictEqual([]);
  });

  it("reports a code that is in neither the lookup nor the unmatched codes", () => {
    const { context, field, issues } = mapping("PID|1|X");
    const unmatched = new Set(["U"]);
    expect(mapCode(context, field(2), lookup, { unmatched })).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["UNMAPPED_CODE"]);
  });

  it("uses the replacement for a code it reports, but not for one the guide leaves out", () => {
    const { context, field, issues } = mapping("PID|1|X|U");
    const options = {
      unmatched: new Set(["U"]),
      kept: (code: string) => `kept ${code}`,
    };
    expect(mapCode(context, field(2), lookup, options)).toBe("kept X");
    expect(mapCode(context, field(3), lookup, options)).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["UNMAPPED_CODE"]);
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "does not find the Object.prototype key %j in a set of unmatched codes",
    (key) => {
      const { context, field, issues } = mapping(`PID|1|${key}`);
      mapCode(context, field(2), lookup, { unmatched: new Set(["U"]) });
      expect(codes(issues)).toStrictEqual(["UNMAPPED_CODE"]);
    },
  );

  it("has nothing to map for an absent, empty or null code", () => {
    const { context, field, issues } = mapping('PID|1||""^|');
    expect(mapCode(context, undefined, lookup)).toBeUndefined();
    expect(mapCode(context, field(2), lookup)).toBeUndefined();
    expect(mapCode(context, part(field(3), 2), lookup)).toBeUndefined();
    expect(mapCode(context, field(4), lookup)).toBeUndefined();
    expect(issues).toStrictEqual([]);
  });

  it("reports a null code once when the context asks for it", () => {
    const { context, field, issues } = mapping('PID|1|""', {
      settings: { reportNulls: true },
    });
    expect(mapCode(context, field(2), lookup)).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["HL7_NULL_IGNORED"]);
  });
});
