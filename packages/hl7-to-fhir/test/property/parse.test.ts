import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { encodeText } from "../../src/hl7v2/escape";
import type { Delimiters, Hl7Message, Segment } from "../../src/hl7v2/model";
import { parse, type ParseFailureCode } from "../../src/hl7v2/parse";
import { isValidSegmentId } from "../../src/hl7v2/segment";
import { stringify } from "../../src/hl7v2/stringify";
import type { Span } from "../../src/shared/issue";
import {
  completeDelimiterSets,
  encodingCharactersOf,
} from "../hl7v2/arbitraries";
import { parsed } from "../hl7v2/helpers";

const standard: Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

/** Characters that make parsing interesting: delimiters, escape content, quotes, terminators and framing. */
const hostileCharacter = fc.constantFrom(
  ...Array.from('|^~\\&#!$*%"\r\nXZHNP.bFSTRE0A1 \t\uFEFF\u000B\u001C'),
);

/** Text made of hostile characters, often starting like a message header. */
const hostileInput = fc.oneof(
  fc.string({ unit: "binary" }),
  fc.string({ unit: hostileCharacter }),
  fc
    .tuple(
      fc.constantFrom("^~\\&", "^~\\", "^~"),
      fc.string({ unit: hostileCharacter, maxLength: 200 }),
    )
    .map(([encoding, rest]) => `MSH|${encoding}|${rest}`),
  fc
    .tuple(
      fc.constantFrom("", "\uFEFF", "\u000B"),
      fc.string({ unit: hostileCharacter }),
    )
    .map(([prefix, rest]) => `${prefix}MSH|^~\\&#|||||||||2.7${rest}`),
);

const failureCodes: readonly ParseFailureCode[] = [
  "INVALID_INPUT",
  "EMPTY_INPUT",
  "MISSING_MSH",
  "INVALID_FIELD_SEPARATOR",
  "INVALID_ENCODING_CHARACTERS",
];

describe("parse properties", () => {
  propertyTest.prop([hostileInput], { numRuns: 1000 })(
    "never throws and returns a well-formed result for any string",
    (input) => {
      const result = parse(input);
      if (result.ok) {
        expect(result.value.message.segments[0]?.id).toBe("MSH");
        // Every tree parse returns can be written.
        expect(stringify(result.value.message).ok).toBe(true);
        const { segments } = result.value.message;
        const { issues } = result.value;
        // Segments come in input order and do not overlap.
        for (const [index, segment] of segments.entries()) {
          const next = segments[index + 1];
          expect(segment.span.start).toBeLessThanOrEqual(segment.span.end);
          if (next) expect(next.span.start).toBeGreaterThan(segment.span.end);
        }
        // A segment has an invalid identifier exactly when an INVALID_SEGMENT_ID issue names its index.
        const invalid = new Set(
          issues
            .filter(({ code }) => code === "INVALID_SEGMENT_ID")
            .map(({ location }) => location?.segmentIndex),
        );
        for (const [index, segment] of segments.entries()) {
          expect(invalid.has(index)).toBe(!isValidSegmentId(segment.id));
        }
      } else {
        expect(failureCodes).toContain(result.error.code);
        expect(result.error.issues.at(-1)?.code).toBe(result.error.code);
      }
      // Issues come in input order, apart from the failure that ends the list.
      const issues = result.ok
        ? result.value.issues
        : result.error.issues.slice(0, -1);
      const starts = issues.map(({ location }) => location?.span.start ?? 0);
      expect(starts).toStrictEqual([...starts].sort((a, b) => a - b));
    },
  );

  propertyTest.prop([hostileInput], { numRuns: 1000 })(
    "gives every node a span that slices back to its raw text",
    (input) => {
      const result = parse(input);
      if (result.ok) expectExactSpans(input, result.value.message);
    },
  );

  propertyTest.prop([hostileInput], { numRuns: 300 })(
    "locates every issue inside the input",
    (input) => {
      const result = parse(input);
      const issues = result.ok ? result.value.issues : result.error.issues;
      for (const { location } of issues) {
        expect(location?.span.start).toBeGreaterThanOrEqual(0);
        expect(location?.span.end).toBeLessThanOrEqual(input.length);
      }
    },
  );

  propertyTest.prop([abstractMessages(), completeDelimiterSets])(
    "yields the same tree for any set of distinct delimiters",
    (segments, delimiters) => {
      const withStandard = parsed(serialize(segments, standard));
      const withCustom = parsed(serialize(segments, delimiters));
      expect(withCustom.message.delimiters).toStrictEqual(delimiters);
      expect(withCustom.issues).toStrictEqual([]);
      expect(withoutSpans(withCustom.message.segments)).toStrictEqual(
        withoutSpans(withStandard.message.segments),
      );
    },
  );
});

describe("parse performance", () => {
  // Generous budgets: a linear parser needs a few milliseconds per megabyte, a quadratic one minutes.
  const budget = 3000;
  const header = "MSH|^~\\&|LAB|||||||1|P|2.5.1\rOBX|1|TX|||";

  it.each([
    ["plain text", "a".repeat(1_000_000)],
    ["line break escapes", "\\.br\\".repeat(200_000)],
    ["hexadecimal escapes", `\\X${"41".repeat(500_000)}\\`],
    ["an unterminated escape", `\\${"a".repeat(1_000_000)}`],
    ["components", "a^".repeat(500_000)],
    ["empty subcomponents", "&".repeat(1_000_000)],
  ])("parses a 1 MB field of %s in linear time", (_description, field) => {
    const input = `${header}${field}`;
    const started = performance.now();
    const result = parse(input);
    const elapsed = performance.now() - started;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(budget);
  });
});

/** A message without header as segments of fields of repetitions of components of subcomponent values. */
type AbstractSegment = readonly [id: string, fields: readonly string[][][][]];

function abstractMessages(): fc.Arbitrary<AbstractSegment[]> {
  const value = fc.string({
    unit: fc.constantFrom(...Array.from('ab|^~\\&#!$*%"\r\n .')),
    maxLength: 6,
  });
  const list = <T>(item: fc.Arbitrary<T>) => fc.array(item, { maxLength: 3 });
  const segment = fc.tuple(
    fc.constantFrom("PID", "OBX", "NTE", "ZPI"),
    list(list(list(list(value)))),
  );
  return fc.array(segment, { maxLength: 4 });
}

/** Writes the segments after an MSH header, escaping every value. */
function serialize(
  segments: readonly AbstractSegment[],
  delimiters: Delimiters,
): string {
  const { field, component, repetition, subcomponent = "" } = delimiters;
  const header = `MSH${field}${encodingCharactersOf(delimiters)}${field}APP`;
  const lines = segments.map(([id, fields]) =>
    [
      id,
      ...fields.map((repetitions) =>
        repetitions
          .map((components) =>
            components
              .map((subcomponents) =>
                subcomponents
                  .map((text) => encodeText(text, delimiters) ?? "")
                  .join(subcomponent),
              )
              .join(component),
          )
          .join(repetition),
      ),
    ].join(field),
  );
  return [header, ...lines].join("\r");
}

/** The tree without spans, which necessarily differ between delimiter sets of different escape lengths. */
function withoutSpans(segments: readonly Segment[]): unknown {
  return JSON.parse(
    JSON.stringify(segments.slice(1), (key, value: unknown) =>
      key === "span" ? undefined : value,
    ),
  );
}

/**
 * Checks that every node's span covers exactly its raw text: children are contiguous, separated by their level's
 * delimiter, and whatever follows the last child consists only of delimiters (trimmed empty children).
 */
function expectExactSpans(input: string, message: Hl7Message): void {
  const {
    field,
    repetition,
    component,
    subcomponent = "",
    escape,
  } = message.delimiters;
  const text = ({ start, end }: Span) => input.slice(start, end);

  function expectChildren(
    parent: Span,
    children: readonly { span: Span }[],
    separators: string,
  ): void {
    let expectedStart = parent.start;
    for (const [index, child] of children.entries()) {
      expect(child.span.start).toBe(expectedStart);
      expect(child.span.end).toBeGreaterThanOrEqual(child.span.start);
      if (index < children.length - 1) {
        expect(input.charAt(child.span.end)).toBe(separators.charAt(0));
      }
      expectedStart = child.span.end + 1;
    }
    const tailStart = children.at(-1)?.span.end ?? parent.start;
    expect(
      Array.from(text({ start: tailStart, end: parent.end })).every((c) =>
        separators.includes(c),
      ),
    ).toBe(true);
  }

  let previousEnd = -1;
  for (const segment of message.segments) {
    const raw = text(segment.span);
    expect(segment.span.start).toBeGreaterThan(previousEnd);
    // A line feed can be data, in messages whose segments end with carriage returns; a carriage return never is.
    expect(raw).not.toContain("\r");
    expect(raw.startsWith(segment.id)).toBe(true);
    previousEnd = segment.span.end;

    const fieldsStart = segment.span.start + segment.id.length + 1;
    const fields =
      segment.id === "MSH" ? segment.fields.slice(1) : segment.fields;
    if (segment.id === "MSH") {
      expect(segment.fields[0] && text(segment.fields[0].span)).toBe(field);
    }
    if (fields.length > 0) {
      expectChildren(
        { start: fieldsStart, end: segment.span.end },
        fields,
        field + repetition + component + subcomponent,
      );
    }
    for (const [fieldIndex, fieldNode] of fields.entries()) {
      if (segment.id === "MSH" && fieldIndex === 0) continue;
      expectChildren(
        fieldNode.span,
        fieldNode.repetitions,
        repetition + component + subcomponent,
      );
      for (const repetitionNode of fieldNode.repetitions) {
        expectChildren(
          repetitionNode.span,
          repetitionNode.components,
          component + subcomponent,
        );
        for (const componentNode of repetitionNode.components) {
          expectChildren(
            componentNode.span,
            componentNode.subcomponents,
            subcomponent,
          );
          for (const leaf of componentNode.subcomponents) {
            const leafRaw = text(leaf.span);
            if (leaf.kind === "empty") expect(leafRaw).toBe("");
            if (leaf.kind === "null") expect(leafRaw).toBe('""');
            const escaped = escape !== undefined && leafRaw.includes(escape);
            if (leaf.kind === "value" && !escaped) {
              expect(leaf.value).toBe(leafRaw);
            }
          }
        }
      }
    }
  }
}
