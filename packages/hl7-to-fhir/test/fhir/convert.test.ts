import type { Bundle, DiagnosticReport, Patient } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";

import {
  convert,
  type ConvertFailure,
  type Conversion,
  type Converter,
  createConverter,
  type ConvertOptions,
  type Customizer,
  type MappedResource,
  type SegmentMapper,
  type SegmentMapperContext,
  sequentialIds,
} from "../../src/index";
import { defineSegment } from "../../src/hl7v2/define-segment";

const adt = [
  "MSH|^~\\&|ADT|HOSP|EHR|HOSP|20240115103000+0100||ADT^A01^ADT_A01|MSG00001|P|2.5.1",
  "EVN|A01|20240115103000+0100",
  "PID|1||PATID1234^^^HOSP^MR||Everyman^Adam||19800101|M",
  "PV1|1|I|2000^2012^01",
].join("\r");

const ids = sequentialIds("convert");

function converted(input: string, options: ConvertOptions = {}): Conversion {
  const result = convert(input, { ids, ...options });
  if (!result.ok)
    expect.fail(`expected a conversion, got ${result.error.code}`);
  return result.value;
}

function failure(input: unknown, options?: unknown): ConvertFailure {
  // Plain JavaScript callers can pass anything.
  const result = (
    convert as (input: unknown, options?: unknown) => ReturnType<typeof convert>
  )(input, options);
  if (result.ok) expect.fail("expected the conversion to fail");
  return result.error;
}

function resources(bundle: Bundle<MappedResource>): MappedResource[] {
  return (bundle.entry ?? []).flatMap(({ resource }) =>
    resource === undefined ? [] : [resource],
  );
}

function patientOf(bundle: Bundle<MappedResource>): Patient {
  const resource = bundle.entry?.[0]?.resource;
  if (resource?.resourceType !== "Patient")
    expect.fail("expected a Patient first");
  return resource;
}

describe("convert", () => {
  it("converts an ADT^A01 message to a collection of a Patient and an Encounter", () => {
    const { bundle, message, issues } = converted(adt, {
      identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" },
    });
    expect(bundle).toMatchObject({
      resourceType: "Bundle",
      identifier: { value: "MSG00001" },
      type: "collection",
      timestamp: "2024-01-15T10:30:00+01:00",
      entry: [
        {
          fullUrl: `urn:uuid:${ids(0)}`,
          resource: { resourceType: "Patient" },
        },
        {
          fullUrl: `urn:uuid:${ids(1)}`,
          resource: {
            resourceType: "Encounter",
            status: "in-progress",
            subject: { reference: `urn:uuid:${ids(0)}` },
          },
        },
      ],
    });
    expect(message.segments.map(({ id }) => id)).toStrictEqual([
      "MSH",
      "EVN",
      "PID",
      "PV1",
    ]);
    // The EVN, which the guide maps to a Provenance, is the one segment the library leaves out.
    expect(
      issues.map(({ code, location }) => [code, location.segmentId]),
    ).toStrictEqual([["SEGMENT_NOT_MAPPED", "EVN"]]);
  });

  it("makes random UUIDs by default", () => {
    const first = convert(adt);
    const second = convert(adt);
    if (!first.ok || !second.ok) expect.fail("expected conversions");
    const urls = [first, second].flatMap(({ value }) =>
      (value.bundle.entry ?? []).map(({ fullUrl }) => fullUrl),
    );
    expect(new Set(urls).size).toBe(4);
    for (const url of urls) {
      expect(url).toMatch(
        /^urn:uuid:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
      );
    }
  });

  it("lists the issues of parsing, validation and mapping in message order, each once", () => {
    const { issues } = converted(`${adt.replace("19800101", "19800230")}\n`, {
      identifierSystems: { HOSP: "urn:oid:1.2.3.4.5" },
    });
    expect(
      issues.map(({ code, location }) => [code, location.segmentId ?? null]),
    ).toStrictEqual([
      ["SEGMENT_NOT_MAPPED", "EVN"],
      ["INVALID_DATE_TIME", "PID"],
      ["NON_STANDARD_SEGMENT_TERMINATOR", null],
    ]);
  });

  it("reports at most 10,000 issues and says when there were more", () => {
    const noisy = `${adt}\rOBX|1|NM|2093-3^Cholesterol^LN||${"x~".repeat(12_000)}|||||F`;
    const { issues } = converted(noisy);
    expect(issues).toHaveLength(10_001);
    expect(issues.at(-1)?.code).toBe("TOO_MANY_ISSUES");
  });

  it("reports explicit nulls only for transactions", () => {
    const withNull = adt.replace("19800101|M", '19800101|""');
    expect(converted(withNull).issues.map(({ code }) => code)).not.toContain(
      "HL7_NULL_IGNORED",
    );
    expect(
      converted(withNull, { bundleType: "transaction" }).issues.map(
        ({ code }) => code,
      ),
    ).toContain("HL7_NULL_IGNORED");
  });

  it("applies the timezone to times without offset in a message without one", () => {
    const local = adt
      .replaceAll("+0100", "")
      .replace("19800101", "198001011230");
    expect(patientOf(converted(local).bundle)._birthDate).toBeUndefined();
    expect(
      patientOf(converted(local, { timezone: "-05:00" }).bundle)._birthDate,
    ).toStrictEqual({
      extension: [
        {
          url: "http://hl7.org/fhir/StructureDefinition/patient-birthTime",
          valueDateTime: "1980-01-01T12:30:00-05:00",
        },
      ],
    });
  });

  describe("segments it does not map", () => {
    /** The segment identifier and index of each SEGMENT_NOT_MAPPED issue of a conversion. */
    function unmapped(input: string, options: ConvertOptions = {}): unknown[] {
      return converted(input, options)
        .issues.filter(({ code }) => code === "SEGMENT_NOT_MAPPED")
        .map(({ severity, location }) => [
          severity,
          location.segmentId,
          location.segmentIndex,
        ]);
    }

    it("are reported once per identifier, at the first", () => {
      const input = [
        adt,
        "NK1|1|Everywoman^Eve",
        "NK1|2|Everyman^Abel",
        "AL1|1||^Penicillin",
      ].join("\r");
      expect(unmapped(input)).toStrictEqual([
        ["info", "EVN", 1],
        ["info", "NK1", 4],
        ["info", "AL1", 6],
      ]);
    });

    it("are reported for a note of an order, but not for a note of an observation", () => {
      const input = [
        "MSH|^~\\&|LAB|HOSP|||20240116091500+0100||ORU^R01|1|P|2.5.1",
        "PID|1||PATID1234",
        "OBR|1||F1|24331-1^Lipid panel^LN",
        "NTE|1|L|Order note",
        "OBX|1|NM|2093-3^Cholesterol^LN||196|mg/dL|||||F",
        "NTE|1|L|Fasting sample.",
      ].join("\r");
      expect(unmapped(input)).toStrictEqual([["info", "NTE", 3]]);
    });

    it("are not reported for a segment a segment mapper maps", () => {
      expect(
        unmapped(`${adt}\rZPI|1|blue`, {
          segmentMappers: { ZPI: () => undefined },
        }),
      ).toStrictEqual([["info", "EVN", 1]]);
      expect(unmapped(`${adt}\rZPI|1|blue`)).toContainEqual(["info", "ZPI", 4]);
    });
  });

  it("converts an ADT^A04, whose structure table 0354 resolves to ADT_A01", () => {
    expect(
      converted(adt.replace("ADT^A01^ADT_A01", "ADT^A04")).bundle.entry,
    ).toHaveLength(2);
  });

  describe("fails", () => {
    it.each([
      ["no message", "PID|1||PATID1234"],
      ["no string", 42],
      ["empty", ""],
    ])("with PARSE_FAILED for %s", (_, input) => {
      const failed = failure(input);
      expect(failed.code).toBe("PARSE_FAILED");
      expect(failed.issues.at(-1)?.severity).toBe("error");
    });

    it.each([
      [
        "an acknowledgment",
        "MSH|^~\\&|LAB|HOSP|||20240115103000||ACK^A01|1|P|2.5.1\rMSA|AA|1",
      ],
      [
        "a discharge (ADT_A03)",
        adt.replace("ADT^A01^ADT_A01", "ADT^A03^ADT_A03"),
      ],
      ["no message type", "MSH|^~\\&|LAB|HOSP|||20240115103000|||1|P|2.5.1"],
    ])("with UNSUPPORTED_MESSAGE for %s, located at MSH-9", (_, input) => {
      const failed = failure(input);
      expect(failed).toMatchObject({
        code: "UNSUPPORTED_MESSAGE",
        location: { segmentIndex: 0, segmentId: "MSH", field: 9 },
      });
      expect(failed.issues.length).toBeGreaterThan(0);
    });

    it.each([
      ["ADT^A03^ADT_A01", "a discharge in the structure ADT_A01"],
      ["ADT^A05^ADT_A01", "a pre-admission named with the structure ADT_A01"],
      ["ORU^R30^ORU_R01", "an unsolicited point-of-care result"],
    ])(
      "with UNSUPPORTED_MESSAGE for %s, %s, located at the trigger event",
      (type) => {
        const failed = failure(adt.replace("ADT^A01^ADT_A01", type));
        expect(failed).toMatchObject({
          code: "UNSUPPORTED_MESSAGE",
          location: { segmentIndex: 0, field: 9, component: 2 },
        });
        expect(failed.message).toContain("MSH-9.2");
      },
    );
  });

  describe("options", () => {
    it.each([
      ["options", "options"],
      [{ timeZone: "+01:00" }, "timeZone"],
      [{ timezone: "Europe/Berlin" }, "timezone"],
      [{ timezone: "+15:00" }, "timezone"],
      [{ bundleType: "message" }, "bundleType"],
      [{ ids: "sequential" }, "ids"],
      [{ segments: "ZPI" }, "segments"],
      [{ segments: [{ id: "ZPI" }] }, "segments"],
      [{ segmentMappers: { zpi: () => undefined } }, "segmentMappers.zpi"],
      [{ segmentMappers: { ZPI: "patient" } }, "segmentMappers.ZPI"],
      [{ segmentMappers: [] }, "segmentMappers"],
      [
        { customize: { Practitioner: (r: unknown) => r } },
        "customize.Practitioner",
      ],
      [{ codeSystems: { L: 1 } }, "codeSystems.L"],
      [{ identifierSystems: null }, "identifierSystems"],
      [{ codeSystems: new Map([["L", "urn:l"]]) }, "codeSystems"],
      [{ identifierSystems: [["HOSP", "urn:oid:1.2"]] }, "identifierSystems"],
      [
        {
          segmentMappers: new (class Mappers {
            readonly ZPI = (): undefined => undefined;
          })(),
        },
        "segmentMappers",
      ],
      [
        { customize: Object.create({ Patient: (r: unknown) => r }) as object },
        "customize",
      ],
    ])("fail with INVALID_OPTIONS for %j", (options, option) => {
      expect(failure(adt, options)).toMatchObject({
        code: "INVALID_OPTIONS",
        option,
        issues: [],
      });
    });

    it("may be left out, also by plain JavaScript callers of createConverter", () => {
      const toFhir = (createConverter as (options?: unknown) => Converter)();
      expect(toFhir(adt).ok).toBe(true);
    });

    it("say in the failure message what the option must be", () => {
      expect(failure(adt, { timezone: "CET" }).message).toBe(
        'The option timezone must be an offset from UTC as FHIR writes it, such as "+01:00" or "Z".',
      );
      expect(failure(adt, { codeSystems: new Map() }).message).toBe(
        "The option codeSystems must map names of coding systems to URIs in a plain object.",
      );
    });

    it("accept records without a prototype", () => {
      const identifierSystems = Object.assign(Object.create(null) as object, {
        HOSP: "urn:oid:1.2.3.4.5",
      });
      expect(
        patientOf(converted(adt, { identifierSystems }).bundle).identifier?.[0]
          ?.system,
      ).toBe("urn:oid:1.2.3.4.5");
    });

    it("are checked once, when the converter is made, and read only then", () => {
      const identifierSystems: Record<string, string> = {};
      const toFhir = createConverter({ ids, identifierSystems });
      identifierSystems["HOSP"] = "urn:oid:1.2.3.4.5";
      const result = toFhir(adt);
      if (!result.ok) expect.fail("expected a conversion");
      expect(
        patientOf(result.value.bundle).identifier?.[0]?.system,
      ).toBeUndefined();
    });

    describe("with hostile keys", () => {
      const hostile = [
        "__proto__",
        "constructor",
        "toString",
        "hasOwnProperty",
      ];

      it.each(hostile)("look up %s as an ordinary key", (key) => {
        const input = adt.replace(
          "PATID1234^^^HOSP^MR",
          `PATID1234^^^${key}^MR`,
        );
        const systems = JSON.parse(`{"${key}": "urn:oid:1.2.3.4.5"}`) as Record<
          string,
          string
        >;
        expect(
          patientOf(converted(input, { identifierSystems: systems }).bundle)
            .identifier?.[0]?.system,
        ).toBe("urn:oid:1.2.3.4.5");
        expect(
          patientOf(converted(input).bundle).identifier?.[0]?.system,
        ).toBeUndefined();
      });

      it.each(hostile)(
        "look up the coding system %s as an ordinary key",
        (key) => {
          const input = `${adt}\rOBX|1|CE|1234-5^Test^${key}||P^Positive^${key}||||||F`;
          const codeSystems = JSON.parse(
            `{"${key}": "urn:oid:1.2.3"}`,
          ) as Record<string, string>;
          const observation = (options: ConvertOptions): unknown =>
            resources(converted(input, options).bundle)[2];
          expect(observation({ codeSystems })).toMatchObject({
            code: { coding: [{ system: "urn:oid:1.2.3", code: "1234-5" }] },
            valueCodeableConcept: { coding: [{ system: "urn:oid:1.2.3" }] },
          });
          expect(observation({})).not.toHaveProperty("code.coding.0.system");
        },
      );

      it("reject a segment mapper or customizer keyed by one, and pollute nothing", () => {
        const hook = (): undefined => undefined;
        for (const key of hostile) {
          expect(failure(adt, { segmentMappers: { [key]: hook } }).code).toBe(
            "INVALID_OPTIONS",
          );
          expect(failure(adt, { customize: { [key]: hook } }).code).toBe(
            "INVALID_OPTIONS",
          );
        }
        expect(Object.prototype).not.toHaveProperty("PID");
        expect(({} as Record<string, unknown>)["ZPI"]).toBeUndefined();
      });
    });
  });

  describe("hooks", () => {
    const zpi = defineSegment({
      id: "ZPI",
      fields: [
        { name: "setId", dataType: "SI" },
        { name: "favouriteColour", dataType: "ST" },
      ],
    });
    const colourUrl = "https://example.org/fhir/favourite-colour";
    const withZpi = `${adt}\rZPI|1|blue`;

    it("map a Z segment to a Patient extension, as the documentation shows", () => {
      const toFhir = createConverter({
        ids,
        segments: [zpi],
        segmentMappers: {
          ZPI: (segment, context) => {
            const colour =
              segment.fields[1]?.repetitions[0]?.components[0]
                ?.subcomponents[0];
            if (colour?.kind !== "value") return;
            context.extend("Patient", (patient) => ({
              ...patient,
              extension: [{ url: colourUrl, valueString: colour.value }],
            }));
          },
        },
      });
      const result = toFhir(withZpi);
      if (!result.ok) expect.fail("expected a conversion");
      expect(patientOf(result.value.bundle).extension).toStrictEqual([
        { url: colourUrl, valueString: "blue" },
      ]);
      // With its definition, the Z segment is no finding of validation.
      expect(result.value.issues.map(({ code }) => code)).not.toContain(
        "UNDEFINED_Z_SEGMENT",
      );
    });

    it("extend the resource of the type before the mapped segment", () => {
      const input = [
        "MSH|^~\\&|LAB|HOSP|||20240116091500+0100||ORU^R01|1|P|2.5.1",
        "PID|1||PATID1234",
        "ZPI|1|blue",
        "OBR|1||F1|24331-1^Lipid panel^LN",
        "PID|2||PATID5678",
        "ZPI|2|green",
        "OBR|1||F2|24331-1^Lipid panel^LN",
      ].join("\r");
      const { bundle } = converted(input, {
        segments: [zpi],
        segmentMappers: {
          ZPI: (segment, context) => {
            const text =
              segment.fields[1]?.repetitions[0]?.components[0]
                ?.subcomponents[0];
            context.extend("Patient", (patient) => ({
              ...patient,
              language: text?.kind === "value" ? text.value : "none",
            }));
          },
        },
      });
      expect(
        resources(bundle)
          .filter(
            (resource): resource is Patient =>
              resource.resourceType === "Patient",
          )
          .map(({ language }) => language),
      ).toStrictEqual(["blue", "green"]);
    });

    it("extend the first resource of the type when none comes before the segment", () => {
      const update = vi.fn((patient: Patient) => ({
        ...patient,
        active: true,
      }));
      const input = adt.replace("EVN|", "ZPI|1|blue\rEVN|");
      const { bundle } = converted(input, {
        segmentMappers: {
          ZPI: (_, context) => {
            context.extend("Patient", update);
          },
        },
      });
      expect(update).toHaveBeenCalledTimes(1);
      expect(patientOf(bundle).active).toBe(true);
    });

    it("extend nothing when the bundle has no resource of the type, and say so", () => {
      const update = vi.fn((report: DiagnosticReport) => report);
      const { issues } = converted(withZpi, {
        segmentMappers: {
          ZPI: (_, context) => {
            context.extend("DiagnosticReport", update);
          },
        },
      });
      expect(update).not.toHaveBeenCalled();
      expect(
        issues.filter(({ code }) => code === "EXTENSION_TARGET_MISSING"),
      ).toMatchObject([
        {
          severity: "warning",
          location: { segmentId: "ZPI", segmentIndex: 4 },
          value: "DiagnosticReport",
        },
      ]);
    });

    it("cannot extend once the segment mapper has returned", () => {
      let kept: SegmentMapperContext | undefined;
      const { bundle } = converted(withZpi, {
        segmentMappers: {
          ZPI: (_, context) => {
            kept = context;
          },
        },
      });
      expect(() =>
        kept?.extend("Patient", (patient) => ({ ...patient, active: true })),
      ).toThrow(TypeError);
      expect(patientOf(bundle).active).toBeUndefined();
    });

    it("customize each resource of a type with the segment it comes from", () => {
      const segmentIndexes: number[] = [];
      const { bundle } = converted(adt, {
        customize: {
          Patient: (patient, context) => {
            segmentIndexes.push(context.segmentIndex);
            return { ...patient, active: true };
          },
          Encounter: (encounter, context) => {
            segmentIndexes.push(context.segmentIndex);
            return encounter;
          },
        },
      });
      expect(patientOf(bundle).active).toBe(true);
      expect(segmentIndexes).toStrictEqual([2, 3]);
    });

    it("run the segment mappers before the customizers", () => {
      const order: string[] = [];
      converted(withZpi, {
        segmentMappers: { ZPI: () => order.push("ZPI") },
        customize: { Patient: (patient) => (order.push("Patient"), patient) },
      });
      expect(order).toStrictEqual(["ZPI", "Patient"]);
    });

    describe("that fail", () => {
      const thrown = new Error("hook failed for Everyman");

      it.each<[string, ConvertOptions, string, number]>([
        [
          "a throwing customizer",
          {
            customize: {
              Encounter: () => {
                throw thrown;
              },
            },
          },
          "customize.Encounter",
          3,
        ],
        [
          "a throwing segment mapper",
          {
            segmentMappers: {
              ZPI: () => {
                throw thrown;
              },
            },
          },
          "segmentMappers.ZPI",
          4,
        ],
        [
          "a throwing extension",
          {
            segmentMappers: {
              ZPI: (_, context) => {
                context.extend("Patient", () => {
                  throw thrown;
                });
              },
            },
          },
          "segmentMappers.ZPI",
          4,
        ],
        [
          "a throwing id generator",
          {
            ids: () => {
              throw thrown;
            },
          },
          "ids",
          2,
        ],
      ])(
        "turn %s into HOOK_FAILED with its cause",
        (_, options, hook, segmentIndex) => {
          const failed = failure(withZpi, { ids, ...options });
          expect(failed).toMatchObject({
            code: "HOOK_FAILED",
            hook,
            location: { segmentIndex },
            cause: thrown,
          });
          // The message is safe to log: what the hook threw is only in `cause`.
          expect(failed.message).not.toContain("Everyman");
          expect(failed.issues.length).toBeGreaterThan(0);
        },
      );

      it.each<[string, ConvertOptions, string]>([
        [
          "undefined",
          { customize: { Patient: () => undefined as unknown as Patient } },
          "customize.Patient",
        ],
        [
          "a resource of another type",
          {
            customize: {
              Patient: () =>
                ({ resourceType: "Observation" }) as unknown as Patient,
            },
          },
          "customize.Patient",
        ],
        [
          "an extension of another type",
          {
            segmentMappers: {
              ZPI: (_, context) => {
                context.extend(
                  "Patient",
                  () => ({ resourceType: "Group" }) as unknown as Patient,
                );
              },
            },
          },
          "segmentMappers.ZPI",
        ],
        ["an id that is no UUID", { ids: () => "patient-1" }, "ids"],
        [
          "a promise, as an async segment mapper does",
          {
            segmentMappers: {
              ZPI: (async () => Promise.resolve()) as unknown as SegmentMapper,
            },
          },
          "segmentMappers.ZPI",
        ],
        [
          "a promise, as an async customizer does",
          {
            customize: {
              Patient: (async (patient: Patient) =>
                Promise.resolve(patient)) as unknown as Customizer<"Patient">,
            },
          },
          "customize.Patient",
        ],
        [
          "an object whose resource type cannot be read",
          {
            customize: {
              Patient: () => ({
                get resourceType(): never {
                  throw new TypeError("revoked");
                },
              }),
            },
          },
          "customize.Patient",
        ],
        [
          "nothing after extending a type the conversion does not create",
          {
            segmentMappers: {
              ZPI: (_, context) => {
                (context.extend as (type: string, update: unknown) => void)(
                  "Practitioner",
                  (resource: unknown) => resource,
                );
              },
            },
          },
          "segmentMappers.ZPI",
        ],
      ])(
        "fail with HOOK_FAILED for a hook that returns %s",
        (_, options, hook) => {
          const failed = failure(withZpi, { ids, ...options });
          expect(failed).toMatchObject({ code: "HOOK_FAILED", hook });
          if (failed.code === "HOOK_FAILED")
            expect(failed.cause).toBeInstanceOf(TypeError);
        },
      );

      it("stop the segment mapper's extensions after the first failure", () => {
        const second = vi.fn((patient: Patient) => patient);
        const failed = failure(withZpi, {
          segmentMappers: {
            ZPI: (
              _: unknown,
              context: { extend: (type: string, update: unknown) => void },
            ) => {
              context.extend("Patient", () => null);
              context.extend("Patient", second);
            },
          },
        });
        expect(failed.code).toBe("HOOK_FAILED");
        expect(second).not.toHaveBeenCalled();
      });
    });
  });
});
