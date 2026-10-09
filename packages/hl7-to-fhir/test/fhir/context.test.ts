import { describe, expect, it } from "vitest";

import {
  createMappingSettings,
  defaultMappingSettings,
  isIgnoredNull,
  present,
  reportIssue,
  text,
  textAt,
  toLookup,
} from "../../src/fhir/context";
import { maxIssues } from "../../src/shared/collect";
import { codes, mapping } from "./helpers";

describe("createMappingSettings", () => {
  it("has the defaults without options", () => {
    expect(createMappingSettings()).toStrictEqual({
      ok: true,
      value: defaultMappingSettings,
    });
  });

  it("turns the lookup records into maps and keeps the other options", () => {
    const result = createMappingSettings({
      identifierSystems: { HOSP: "urn:oid:1.2.3", COUNT: 3 },
      codeSystems: { L: "http://lab.example/codes" },
      timezone: "-05:30",
      reportNulls: true,
    });
    expect(result).toStrictEqual({
      ok: true,
      value: {
        identifierSystems: new Map([["HOSP", "urn:oid:1.2.3"]]),
        codeSystems: new Map([["L", "http://lab.example/codes"]]),
        timezone: "-05:30",
        reportNulls: true,
      },
    });
  });

  it.each(["Z", "+00:00", "-14:00", "+14:00", "+05:45"])(
    "accepts the time zone %j",
    (timezone) => {
      expect(createMappingSettings({ timezone }).ok).toBe(true);
    },
  );

  it.each([
    "Europe/Berlin",
    "+0100",
    "+15:00",
    "+14:30",
    "01:00",
    "z",
    "UTC",
    "",
  ])("rejects the time zone %j and names the option", (timezone) => {
    expect(createMappingSettings({ timezone })).toStrictEqual({
      ok: false,
      error: { option: "timezone", value: timezone },
    });
  });

  it("does not let keys of Object.prototype into the lookups", () => {
    const hostile = JSON.parse('{"__proto__":"urn:proto"}') as Record<
      string,
      unknown
    >;
    const result = createMappingSettings({ identifierSystems: hostile });
    if (!result.ok) expect.fail("expected settings");
    expect(result.value.identifierSystems.get("__proto__")).toBe("urn:proto");
    expect(result.value.identifierSystems.get("constructor")).toBeUndefined();
  });
});

describe("createMappingContext", () => {
  it.each([
    ["20240115103000+0100", "+01:00"],
    ["20240115103000-0530", "-05:30"],
    ["20240115", undefined],
    ["20240115103000", undefined],
    ["not a time+0100", undefined],
    ["202402301000+0100", undefined],
    ['""', undefined],
    ["", undefined],
  ])("reads the offset of MSH-7 %j as %j", (sent, offset) => {
    expect(mapping("PID|1", { sent }).context.messageOffset).toBe(offset);
  });

  it("keeps the settings and the issue list it is given", () => {
    const identifierSystems = new Map([["HOSP", "urn:oid:1.2.3"]]);
    const { context, issues } = mapping("PID|1", {
      settings: { identifierSystems, timezone: "Z", reportNulls: true },
    });
    expect(context).toMatchObject({
      identifierSystems,
      timezone: "Z",
      reportNulls: true,
    });
    expect(context.issues).toBe(issues);
  });
});

describe("toLookup", () => {
  it("keeps the own properties with a string value", () => {
    const lookup = toLookup({ HOSP: "urn:oid:1.2.3", COUNT: 3, NONE: null });
    expect([...lookup]).toStrictEqual([["HOSP", "urn:oid:1.2.3"]]);
  });

  it("treats keys of Object.prototype as ordinary keys", () => {
    // JSON.parse makes __proto__ an own property, as a configuration file would.
    const record = JSON.parse(
      '{"__proto__":"urn:proto","constructor":"urn:constructor"}',
    ) as Record<string, unknown>;
    const lookup = toLookup(record);
    expect(lookup.get("__proto__")).toBe("urn:proto");
    expect(lookup.get("constructor")).toBe("urn:constructor");
    expect(toLookup({}).get("toString")).toBeUndefined();
    expect(toLookup({}).get("hasOwnProperty")).toBeUndefined();
    expect(toLookup(undefined).size).toBe(0);
  });
});

describe("text", () => {
  it("reads the first subcomponent of a value", () => {
    const { context, field } = mapping("PID|1||12345&x^^^HOSP");
    expect(text(context, field(3))).toBe("12345");
    expect(textAt(context, field(3), 4)).toBe("HOSP");
  });

  it("has no text for an absent, empty or null value", () => {
    const { context, field, issues } = mapping('PID|1||^A||""');
    expect(text(context, undefined)).toBeUndefined();
    expect(textAt(context, field(3), 1)).toBeUndefined();
    expect(textAt(context, field(3), 9)).toBeUndefined();
    expect(text(context, field(5))).toBeUndefined();
    expect(issues).toStrictEqual([]);
  });

  it("has no text for a value of removed formatting only", () => {
    const { context, field } = mapping("PID|1||\\H\\");
    expect(text(context, field(3))).toBeUndefined();
  });
});

describe("reportIssue", () => {
  it("adds the issue of the code at the location, with the value", () => {
    const { context, field, issues } = mapping("PID|1|12345");
    const value = field(2);
    if (value === undefined) expect.fail("expected PID-2");
    reportIssue(context, "HL7_NULL_IGNORED", value.location, "12345");
    reportIssue(context, "INVALID_NUMBER", value.location);
    expect(issues).toStrictEqual([
      expect.objectContaining({
        code: "HL7_NULL_IGNORED",
        value: "12345",
        location: value.location,
      }),
      expect.objectContaining({ code: "INVALID_NUMBER" }),
    ]);
    expect(issues[1]).not.toHaveProperty("value");
  });

  it("stops at one issue more than the limit, which TOO_MANY_ISSUES stands for", () => {
    const { context, field, issues } = mapping("PID|1|12345");
    const value = field(2);
    if (value === undefined) expect.fail("expected PID-2");
    for (let count = 0; count < maxIssues + 10; count++) {
      reportIssue(context, "HL7_NULL_IGNORED", value.location);
    }
    expect(issues).toHaveLength(maxIssues + 1);
  });
});

describe("present", () => {
  it("keeps a value and drops an absent or null one", () => {
    const { context, field } = mapping('PID|1||12345^^^HOSP|""');
    const value = field(3);
    expect(present(context, value)).toBe(value);
    expect(present(context, field(4))).toBeUndefined();
    expect(present(context, undefined)).toBeUndefined();
  });

  it("reports a null once", () => {
    const { context, field, issues } = mapping('PID|1||""', {
      settings: { reportNulls: true },
    });
    expect(present(context, field(3))).toBeUndefined();
    expect(codes(issues)).toStrictEqual(["HL7_NULL_IGNORED"]);
  });
});

describe("isIgnoredNull", () => {
  it("reports the explicit null only when the settings ask for it", () => {
    const quiet = mapping('PID|1||""');
    const value = quiet.field(3);
    if (value === undefined) expect.fail("expected PID-3");
    expect(isIgnoredNull(quiet.context, value)).toBe(true);
    expect(quiet.issues).toStrictEqual([]);

    const reporting = mapping('PID|1||""', { settings: { reportNulls: true } });
    expect(text(reporting.context, reporting.field(3))).toBeUndefined();
    expect(codes(reporting.issues)).toStrictEqual(["HL7_NULL_IGNORED"]);
    expect(reporting.issues[0]).toMatchObject({
      severity: "info",
      location: { segmentId: "PID", field: 3, repetition: 1 },
    });
    expect(reporting.issues[0]).not.toHaveProperty("value");
  });

  it("reports a null component at the component", () => {
    const { context, field, issues } = mapping('PID|1||""^Adam', {
      settings: { reportNulls: true },
    });
    const value = field(3);
    if (value === undefined) expect.fail("expected PID-3");
    expect(isIgnoredNull(context, value)).toBe(false);
    expect(textAt(context, value, 1)).toBeUndefined();
    expect(issues.map(({ location }) => location.component)).toStrictEqual([1]);
  });
});
