import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";

import { defineSegment } from "../../src/hl7v2/define-segment";
import { group, type GroupChild } from "../../src/hl7v2/group";
import type { Hl7Message } from "../../src/hl7v2/model";
import { parse } from "../../src/hl7v2/parse";
import { validate } from "../../src/hl7v2/validate";
import type { Issue } from "../../src/shared/issue";

const headers = [
  "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.5.1",
  "MSH|^~\\&|LAB|HOSP|||20240115103000||ORU^R01|1|P|2.5",
  "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A04|1|P|2.3",
  "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A03^ADT_A03|1|P|2.5.1",
  "MSH|^~\\&|ADT|HOSP",
];

/** Segment identifiers of the structures, defined segments, Z segments, unknown and invalid ones. */
const segmentIds = [
  "EVN",
  "PID",
  "PD1",
  "PV1",
  "PV2",
  "ROL",
  "NK1",
  "PR1",
  "IN1",
  "ORC",
  "OBR",
  "OBX",
  "NTE",
  "SPM",
  "TQ1",
  "DSC",
  "MSH",
  "ZPI",
  "ZZZ",
  "XYZ",
  "pid",
];

/** Characters that change the shape of the fields: delimiters, the null, digits, signs and spaces. */
const fieldCharacter = fc.constantFrom(
  ...Array.from('|^~\\&"0123456789+-. AFMNQZ'),
);

/** Messages made of a header and segments of random identifiers with random fields. */
const messages: fc.Arbitrary<Hl7Message> = fc
  .tuple(
    fc.constantFrom(...headers),
    fc.array(
      fc.tuple(
        fc.constantFrom(...segmentIds),
        fc.string({ unit: fieldCharacter, maxLength: 40 }),
      ),
      { maxLength: 30 },
    ),
  )
  .map(([header, segments]) => {
    const text = [header, ...segments.map(([id, rest]) => `${id}|${rest}`)];
    const result = parse(text.join("\r"));
    if (!result.ok) throw new Error("a message with an MSH header parses");
    return result.value.message;
  });

const zpi = defineSegment({
  id: "ZPI",
  fields: [
    { name: "setId", dataType: "SI", optionality: "R" },
    { name: "code", dataType: "IS", table: "0001", maxRepetitions: 2 },
    { name: "time", dataType: "TS" },
  ],
});

/** The segment indexes of a group tree in the order the tree lists them. */
function indexesOf(children: readonly GroupChild[]): number[] {
  return children.flatMap((child) =>
    child.kind === "segment" ? [child.segmentIndex] : indexesOf(child.children),
  );
}

/** Checks that an issue points into the message: to a segment it has and to nodes that exist, inside its span. */
function expectInside(message: Hl7Message, { location }: Issue): void {
  const { span, segmentIndex, segmentId } = location;
  const end = message.segments.at(-1)?.span.end ?? 0;
  expect(span.start).toBeGreaterThanOrEqual(0);
  expect(span.start).toBeLessThanOrEqual(span.end);
  expect(span.end).toBeLessThanOrEqual(end);
  if (segmentIndex === undefined) return;
  const segment = message.segments[segmentIndex];
  expect(segment).toBeDefined();
  if (segmentId !== undefined) expect(segment?.id).toBe(segmentId);
  expect(span.start).toBeGreaterThanOrEqual(segment?.span.start ?? 0);
  expect(span.end).toBeLessThanOrEqual(segment?.span.end ?? 0);
  // Below the field, every position the location names exists: only a whole field can be missing.
  const { field, repetition, component, subcomponent } = location;
  if (field === undefined || repetition === undefined) return;
  const node = segment?.fields[field - 1]?.repetitions[repetition - 1];
  expect(node).toBeDefined();
  if (component === undefined) return;
  const part = node?.components[component - 1];
  expect(part).toBeDefined();
  if (subcomponent !== undefined) {
    expect(part?.subcomponents[subcomponent - 1]).toBeDefined();
  }
}

describe("validate properties", () => {
  propertyTest.prop([messages], { numRuns: 500 })(
    "locates every issue inside the message, in message order",
    (message) => {
      const issues = validate(message, { segments: [zpi] });
      for (const issue of issues) expectInside(message, issue);
      const starts = issues.map(({ location }) => location.span.start);
      expect(starts).toStrictEqual([...starts].sort((a, b) => a - b));
    },
  );

  propertyTest.prop([messages], { numRuns: 500 })(
    "groups every segment exactly once, in message order",
    (message) => {
      const groups = group(message);
      expect(indexesOf(groups.children)).toStrictEqual(
        message.segments.map((_, index) => index),
      );
      for (const issue of groups.issues) expectInside(message, issue);
    },
  );

  propertyTest.prop([messages], { numRuns: 300 })(
    "reports the issues of group among those of validate",
    (message) => {
      const issues = validate(message);
      for (const issue of group(message).issues) {
        expect(issues).toContainEqual(issue);
      }
    },
  );

  propertyTest.prop([fc.anything()], { numRuns: 300 })(
    "never throws for a value that is not a message",
    (value) => {
      const message = value as Hl7Message;
      expect(() => validate(message)).not.toThrow();
      expect(() => group(message)).not.toThrow();
    },
  );
});
