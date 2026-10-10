import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  convert,
  type ConvertOptions,
  type Customizer,
  type MappedResourceType,
  sequentialIds,
} from "../../src/index";
import { stringify } from "../../src/hl7v2/stringify";
import { maxIssues } from "../../src/shared/collect";
import type { Issue } from "../../src/shared/issue";
import { references } from "../fhir/references";
import { hl7Messages } from "../hl7v2/arbitraries";

const headers = [
  "MSH|^~\\&|ADT|HOSP|||20240115103000+0100||ADT^A01^ADT_A01|1|P|2.5.1",
  "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A08|1|P|2.5.1",
  "MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ORU^R01|1|P|2.5.1",
  "MSH|^~\\&|LAB|HOSP|||20240115103000||ORU^R01^ORU_R01|1|P|2.8",
];

/** Field values with the shapes the mappers read: codes, dates, numbers, composites, repetitions, nulls. */
const values = fc.constantFrom(
  "",
  '""',
  "F",
  "X",
  "I",
  "NM",
  "ST",
  "CE",
  "SN",
  "ED",
  "TM",
  "DT",
  "TS",
  "196",
  "1,5",
  "<>^5",
  "^1^:^128",
  "20240115103000+0100",
  "2024011510",
  "20240230",
  "12345^^^HOSP^MR",
  "Everyman^Adam",
  "2093-3^Cholesterol^LN",
  "^AP^PDF^Base64^JVBERi0xLjQ=",
  "^AP^PDF^Base64^not base64",
  "a~b~c",
  "a&b^c&d",
);

const segmentIds = fc.constantFrom(
  "EVN",
  "PID",
  "PV1",
  "PV2",
  "ORC",
  "OBR",
  "OBX",
  "NTE",
  "SPM",
  "ZPI",
);

/**
 * Messages with the segments and values the mappers read, in any order and number. Most start with a patient, often
 * with a visit, so that most bundles have references between their resources to check.
 */
const mappedMessages = fc
  .tuple(
    fc.constantFrom(...headers),
    fc.constantFrom([], ["PID|1||1"], ["PID|1||1", "PV1|1|I"]),
    fc.array(fc.tuple(segmentIds, fc.array(values, { maxLength: 26 })), {
      maxLength: 12,
    }),
  )
  .map(([header, visit, segments]) =>
    [
      header,
      ...visit,
      ...segments.map(([id, fields]) => [id, ...fields].join("|")),
    ].join("\r"),
  );

/** Converts and checks what holds for every input: no throw, a bounded issue list, references that resolve. */
function checkConversion(
  input: string,
  bundleType: "collection" | "transaction",
): void {
  const result = convert(input, { ids: sequentialIds("property"), bundleType });
  const issues = result.ok ? result.value.issues : result.error.issues;
  expect(issues.length).toBeLessThanOrEqual(maxIssues + 1);
  if (!result.ok) return;
  const { bundle } = result.value;
  const fullUrls = new Set((bundle.entry ?? []).map(({ fullUrl }) => fullUrl));
  expect(
    references(bundle).filter((reference) => !fullUrls.has(reference)),
  ).toStrictEqual([]);
  expect(JSON.parse(JSON.stringify(bundle))).toStrictEqual(bundle);
}

/** Whether the issues are in message order, each code at each span once, as `convert` promises. */
function inOrderAndUnique(issues: readonly Issue[]): boolean {
  const keys = issues.map(
    ({ code, location: { span } }) =>
      `${code} ${String(span.start)} ${String(span.end)}`,
  );
  return (
    new Set(keys).size === keys.length &&
    issues.every(
      (issue, index) =>
        index === 0 ||
        (issues[index - 1]?.location.span.start ?? 0) <=
          issue.location.span.start,
    )
  );
}

/** What a misbehaving hook does, in place of returning a resource of its type. */
const misbehaviours = fc.constantFrom(
  "throw",
  "undefined",
  "number",
  "other type",
  "unreadable",
  "promise",
  "foreign extend",
);

/** A hook that misbehaves as `misbehaviour` says and records that it ran. */
function misbehaving(
  misbehaviour: string,
  ran: () => void,
): (...parameters: unknown[]) => unknown {
  return (...parameters) => {
    ran();
    switch (misbehaviour) {
      case "throw":
        throw new Error("hook failed");
      case "undefined":
        return undefined;
      case "number":
        return 42;
      case "other type":
        return { resourceType: "Group" };
      case "unreadable":
        return new Proxy(
          {},
          {
            has: () => {
              throw new TypeError("revoked");
            },
          },
        );
      case "promise":
        return Promise.resolve(parameters[0]);
      default: {
        // A segment mapper that extends a type the conversion does not create.
        const [, context] = parameters as [
          unknown,
          { extend: (type: string, update: unknown) => void },
        ];
        context.extend("Practitioner", (resource: unknown) => resource);
        return undefined;
      }
    }
  };
}

describe("convert", () => {
  propertyTest.prop([
    fc.string(),
    fc.constantFrom("collection", "transaction"),
  ])("never throws for any string", (input, bundleType) => {
    checkConversion(input, bundleType);
  });

  propertyTest.prop([
    mappedMessages,
    fc.constantFrom("collection", "transaction"),
  ])(
    "never throws for messages with mapped segments in any order, and every reference resolves",
    (input, bundleType) => {
      checkConversion(input, bundleType);
    },
  );

  propertyTest.prop([
    mappedMessages,
    fc.constantFrom("collection", "transaction"),
  ])(
    "is deterministic with sequential ids, and lists issues in order and each once",
    (input, bundleType) => {
      const options: ConvertOptions = {
        ids: sequentialIds("property"),
        bundleType,
      };
      const first = convert(input, options);
      expect(convert(input, options)).toStrictEqual(first);
      const issues = first.ok ? first.value.issues : first.error.issues;
      expect(inOrderAndUnique(issues)).toBe(true);
    },
  );

  propertyTest.prop([
    mappedMessages,
    misbehaviours,
    fc.constantFrom<MappedResourceType>(
      "Patient",
      "Encounter",
      "Observation",
      "DiagnosticReport",
    ),
    fc.constantFrom("customize", "segmentMapper"),
  ])(
    "fails with HOOK_FAILED, and never throws, when a hook misbehaves",
    (input, misbehaviour, resourceType, kind) => {
      const calls: unknown[] = [];
      const hook = misbehaving(misbehaviour, () => calls.push(misbehaviour));
      const options: ConvertOptions =
        kind === "customize"
          ? {
              customize: {
                [resourceType]: hook as Customizer<typeof resourceType>,
              },
            }
          : {
              segmentMappers: {
                PID: hook,
                OBX: hook,
              },
            };
      const result = convert(input, {
        ids: sequentialIds("property"),
        ...options,
      });
      // A customizer that is called fails whatever it misbehaves with; a segment mapper returns nothing, so it fails
      // only when it throws, extends a foreign type or returns what cannot be told from a promise.
      const fails =
        calls.length > 0 &&
        (kind === "customize" ||
          ["throw", "promise", "foreign extend", "unreadable"].includes(
            misbehaviour,
          ));
      expect(result.ok ? undefined : result.error.code).toBe(
        fails ? "HOOK_FAILED" : undefined,
      );
    },
  );

  it("generates messages of which a fair share has references to check", () => {
    const samples = fc.sample(mappedMessages, { numRuns: 300, seed: 42 });
    const linked = samples.filter((input) => {
      const result = convert(input, { ids: sequentialIds("property") });
      return result.ok && references(result.value.bundle).length > 0;
    });
    expect(linked.length / samples.length).toBeGreaterThan(0.5);
  });

  propertyTest.prop([hl7Messages])(
    "never throws for written message trees of any delimiters",
    (message) => {
      const written = stringify(message);
      if (written.ok) checkConversion(written.value, "collection");
    },
  );
});
