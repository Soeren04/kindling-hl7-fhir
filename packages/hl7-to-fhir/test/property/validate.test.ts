import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";

import { defineSegment } from "../../src/hl7v2/define-segment";
import { group, type GroupChild } from "../../src/hl7v2/group";
import type { Hl7Message } from "../../src/hl7v2/model";
import { parse } from "../../src/hl7v2/parse";
import { validate } from "../../src/hl7v2/validate";
import type { Issue } from "../../src/shared/issue";
import { hl7Messages } from "../hl7v2/arbitraries";
import { validMessage } from "../hl7v2/validate/valid-messages";

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

/** The most issues `validate` and `group` return: 10,000 findings and the one that says the rest was left out. */
const issueLimit = 10_001;

/** The summary of an issue for a failure message: where it is and what it says, without the value. */
function summary(issue: Issue): string {
  return `${issue.severity} ${issue.code} at ${String(issue.location.span.start)}`;
}

describe("validate on valid messages", () => {
  propertyTest.prop([validMessage("ADT_A01")], { numRuns: 150 })(
    "reports nothing for an ADT^A01 message that conforms to its definition",
    (message) => {
      expect(validate(message).map(summary)).toStrictEqual([]);
      expect(group(message).issues).toStrictEqual([]);
    },
    30_000,
  );

  propertyTest.prop([validMessage("ORU_R01")], { numRuns: 60 })(
    "reports nothing for an ORU^R01 message that conforms to its definition",
    (message) => {
      expect(validate(message).map(summary)).toStrictEqual([]);
      expect(group(message).issues).toStrictEqual([]);
    },
    30_000,
  );
});

/** What a plain JavaScript caller may put into a field definition: right values, wrong values and anything else. */
const hostileField = fc.record(
  {
    position: fc.oneof(
      fc.integer({ min: -2, max: 50 }),
      fc.double(),
      fc.string(),
    ),
    name: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
    dataType: fc.oneof(
      fc.constantFrom(
        "ST",
        "NM",
        "SI",
        "DT",
        "TS",
        "XPN",
        "CE",
        "CX",
        "varies",
        "ZZ",
        "__proto__",
        "constructor",
      ),
      fc.anything(),
    ),
    optionality: fc.oneof(
      fc.constantFrom("R", "O", "C", "B", "X"),
      fc.anything(),
    ),
    maxRepetitions: fc.oneof(
      fc.integer({ min: -1, max: 5 }),
      fc.constantFrom("unbounded", Infinity, Number.NaN, 2 ** 53),
      fc.anything(),
    ),
    table: fc.oneof(
      fc.constantFrom(
        "0001",
        "0203",
        "0354",
        "9999",
        "001",
        "__proto__",
        undefined,
      ),
      fc.anything(),
    ),
  },
  { requiredKeys: [] },
);

/** Fields that are numbered from 1, as `defineSegment` numbers them, in half of the cases. */
const hostileFields = fc
  .tuple(fc.array(hostileField, { maxLength: 8 }), fc.boolean())
  .map(([list, numbered]) =>
    numbered
      ? list.map((field, index) => ({ ...field, position: index + 1 }))
      : list,
  );

const hostileSegment: fc.Arbitrary<unknown> = fc.oneof(
  fc.record(
    {
      id: fc.oneof(
        fc.constantFrom("ZPI", "PID", "OBX", "MSH", "EVN", "zpi", "ZZZZ"),
        fc.string(),
      ),
      fields: fc.oneof(hostileFields, fc.anything()),
    },
    { requiredKeys: [] },
  ),
  fc.anything(),
);

const hostileOptions: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ segments: fc.array(hostileSegment, { maxLength: 4 }) }),
  fc.anything(),
);

describe("validate and group on hostile arguments", () => {
  propertyTest.prop([messages, hostileOptions], { numRuns: 500 })(
    "never throw for definitions that bypass defineSegment",
    (message, options) => {
      const validated = validate(message, options as never);
      const grouped = group(message, options as never);
      expect(validated.length).toBeLessThanOrEqual(issueLimit);
      expect(grouped.issues.length).toBeLessThanOrEqual(issueLimit);
    },
  );

  propertyTest.prop([messages, hostileOptions], { numRuns: 200 })(
    "report the invalid definitions alike, and group never reports more than validate",
    (message, options) => {
      const validated = validate(message, options as never);
      for (const issue of group(message, options as never).issues) {
        expect(validated).toContainEqual(issue);
      }
    },
  );
});

/** How a mutation changes a message without changing the shape of its tree. */
interface Mutation {
  readonly operation:
    | "dropSegment"
    | "duplicateSegment"
    | "swapSegments"
    | "insertSegment"
    | "setValue"
    | "addComponent"
    | "addRepetition"
    | "clearField";
  readonly first: number;
  readonly second: number;
  readonly text: string;
}

const mutations: fc.Arbitrary<Mutation> = fc.record({
  operation: fc.constantFrom(
    "dropSegment",
    "duplicateSegment",
    "swapSegments",
    "insertSegment",
    "setValue",
    "addComponent",
    "addRepetition",
    "clearField",
  ),
  first: fc.nat({ max: 1000 }),
  second: fc.nat({ max: 1000 }),
  text: fc.constantFrom(
    "x",
    "99",
    "20240230",
    "2.5",
    " F",
    '""',
    "ADT_A01",
    "Z99",
    "A01",
  ),
});

/** The message with one field replaced; the field is the `second`-th of the `first`-th segment, wrapped around. */
function withField(
  message: Hl7Message,
  { first, second }: Mutation,
  change: (
    field: Hl7Message["segments"][number]["fields"][number],
  ) => Hl7Message["segments"][number]["fields"][number],
): Hl7Message {
  const index = first % Math.max(message.segments.length, 1);
  return {
    ...message,
    segments: message.segments.map((segment, at) => {
      if (at !== index || segment.fields.length === 0) return segment;
      const target = second % segment.fields.length;
      return {
        ...segment,
        fields: segment.fields.map((field, position) =>
          position === target ? change(field) : field,
        ),
      };
    }),
  };
}

/** A field holding one value, located by the span of the field it replaces. */
function singleValue(
  field: Hl7Message["segments"][number]["fields"][number],
  text: string,
): Hl7Message["segments"][number]["fields"][number] {
  const { span } = field;
  const subcomponent = { kind: "value", value: text, span } as const;
  return {
    span,
    repetitions: [
      { span, components: [{ span, subcomponents: [subcomponent] }] },
    ],
  };
}

/** The list with `item` inserted before the one at `index`. */
function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  return [...list.slice(0, index), item, ...list.slice(index)];
}

/** Applies one mutation. Every result is still a tree of the shape `Hl7Message` declares. */
function mutate(message: Hl7Message, mutation: Mutation): Hl7Message {
  const { segments } = message;
  const { operation, first, second, text } = mutation;
  const at = first % Math.max(segments.length, 1);
  const other = second % Math.max(segments.length, 1);
  const chosen = segments[at];
  switch (operation) {
    case "dropSegment":
      return {
        ...message,
        segments: segments.filter((_, index) => index !== at),
      };
    case "duplicateSegment":
      return chosen === undefined
        ? message
        : { ...message, segments: insertAt(segments, at, chosen) };
    case "swapSegments": {
      const partner = segments[other];
      if (chosen === undefined || partner === undefined) return message;
      return {
        ...message,
        segments: segments.map((segment, index) =>
          index === at ? partner : index === other ? chosen : segment,
        ),
      };
    }
    case "insertSegment": {
      const span = chosen?.span ?? { start: 0, end: 0 };
      const inserted = { id: text === "x" ? "ZPI" : "OBX", fields: [], span };
      return { ...message, segments: insertAt(segments, at, inserted) };
    }
    case "setValue":
      return withField(message, mutation, (field) => singleValue(field, text));
    case "addComponent":
      return withField(message, mutation, (field) => {
        const { span } = field;
        const component = {
          span,
          subcomponents: [{ kind: "value", value: text, span } as const],
        };
        const [repetition] = field.repetitions;
        return repetition === undefined
          ? singleValue(field, text)
          : {
              ...field,
              repetitions: [
                {
                  ...repetition,
                  components: [...repetition.components, component],
                },
                ...field.repetitions.slice(1),
              ],
            };
      });
    case "addRepetition":
      return withField(message, mutation, (field) => ({
        ...field,
        repetitions: [
          ...field.repetitions,
          ...singleValue(field, text).repetitions,
        ],
      }));
    case "clearField":
      return withField(message, mutation, (field) => ({
        ...field,
        repetitions: [],
      }));
  }
}

describe("validate and group on trees that keep the shape of a message", () => {
  propertyTest.prop(
    [
      fc.oneof(validMessage("ADT_A01"), validMessage("ORU_R01")),
      fc.array(mutations, { maxLength: 6 }),
    ],
    { numRuns: 150 },
  )(
    "never throw and stay within the issue limit after mutations",
    (message, changes) => {
      const mutated = changes.reduce(mutate, message);
      const issues = validate(mutated);
      expect(issues.length).toBeLessThanOrEqual(issueLimit);
      expect(group(mutated).issues.length).toBeLessThanOrEqual(issueLimit);
    },
    30_000,
  );

  propertyTest.prop([hl7Messages], { numRuns: 300 })(
    "never throw for any message tree",
    (message) => {
      expect(validate(message).length).toBeLessThanOrEqual(issueLimit);
      expect(group(message).issues.length).toBeLessThanOrEqual(issueLimit);
    },
  );
});

describe("the issue limit", () => {
  /** A message of `count` segments, each with `invalid` fields that are not a sequence ID. */
  function flood(count: number, invalid: number): Hl7Message {
    const segment = `ZPI|${Array.from({ length: invalid }, () => "x").join("|")}`;
    const text = [headers[0], ...Array.from({ length: count }, () => segment)];
    const result = parse(text.join("\r"));
    if (!result.ok) throw new Error("a message with an MSH header parses");
    return result.value.message;
  }

  const wide = defineSegment({
    id: "ZPI",
    fields: Array.from({ length: 4 }, (_, index) => ({
      name: `field${String(index)}`,
      dataType: "SI",
    })),
  });

  propertyTest.prop(
    [fc.integer({ min: 0, max: 6000 }), fc.integer({ min: 0, max: 4 })],
    {
      numRuns: 6,
      // The first example floods the result, the second stays just below the limit.
      examples: [
        [6000, 4],
        [2500, 4],
      ],
    },
  )(
    "keeps at most 10,000 issues and one that says the rest was left out",
    (count, invalid) => {
      const issues = validate(flood(count, invalid), { segments: [wide] });
      expect(issues.length).toBeLessThanOrEqual(issueLimit);
      const flooded = issues.length === issueLimit;
      expect(issues.at(-1)?.code === "TOO_MANY_ISSUES").toBe(flooded);
      const starts = issues.map(({ location }) => location.span.start);
      expect(starts).toStrictEqual([...starts].sort((a, b) => a - b));
    },
  );
});
