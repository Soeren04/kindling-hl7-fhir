import { expect } from "vitest";

import type { Field, Hl7Message, Segment } from "../../src/hl7v2/model";
import { parse, type ParsedMessage } from "../../src/hl7v2/parse";

/** Parses `input` and fails the test when parsing fails. */
export function parsed(input: string): ParsedMessage {
  const result = parse(input);
  if (!result.ok) {
    expect.fail(
      `expected ${JSON.stringify(input)} to parse, got ${result.error.code}`,
    );
  }
  return result.value;
}

/**
 * A field as nested arrays: repetitions of components of subcomponents, with each subcomponent as its value,
 * `null` for the HL7 null and `""` for an empty subcomponent. Compact enough for table-driven assertions.
 */
export type FieldShape = (string | null)[][][];

export function fieldShape(field: Field | undefined): FieldShape | undefined {
  return field?.repetitions.map((repetition) =>
    repetition.components.map((component) =>
      component.subcomponents.map((subcomponent) => {
        switch (subcomponent.kind) {
          case "value":
            return subcomponent.value;
          case "null":
            return null;
          case "empty":
            return "";
        }
      }),
    ),
  );
}

/**
 * A message as plain data without the spans, which describe the text a tree was read from and so differ between
 * texts that hold the same message.
 */
export function withoutSpans(message: Hl7Message): unknown {
  return JSON.parse(
    JSON.stringify(message, (key, value: unknown) =>
      key === "span" ? undefined : value,
    ),
  );
}

/** Every field of a segment as {@link FieldShape}. */
export function segmentShape(
  segment: Segment | undefined,
): (FieldShape | undefined)[] | undefined {
  return segment?.fields.map(fieldShape);
}
