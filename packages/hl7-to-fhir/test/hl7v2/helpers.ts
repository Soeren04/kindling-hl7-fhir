import { expect } from "vitest";

import type {
  Field,
  Hl7Message,
  Segment,
  Subcomponent,
} from "../../src/hl7v2/model";
import { parse, type ParseSuccess } from "../../src/hl7v2/parse";
import { stringify } from "../../src/hl7v2/stringify";

/** Parses `input` and fails the test when parsing fails. */
export function parsed(input: string): ParseSuccess {
  const result = parse(input);
  if (!result.ok) {
    expect.fail(
      `expected ${JSON.stringify(input)} to parse, got ${result.error.code}`,
    );
  }
  return result.value;
}

/** Writes `message` and fails the test when writing fails. */
export function stringified(message: Hl7Message): string {
  const result = stringify(message);
  if (!result.ok)
    expect.fail(`expected the message to be written, got ${result.error.code}`);
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

/**
 * A message the way `parse(stringify(message))` reads it back, without spans: a value `""` that is not truncated
 * (left by removed formatting commands) becomes an empty subcomponent, and empty nodes at the end of a list, which
 * `stringify` does not write, are dropped. MSH-1 and MSH-2 are kept as they are.
 */
export function canonical(message: Hl7Message): unknown {
  const segments = message.segments.map((segment): Segment => {
    const first = segment.id === "MSH" ? 2 : 0;
    const fields = withoutTrailingEmpty(
      segment.fields.slice(first).map(canonicalField),
      (field) => field.repetitions.length === 0,
    );
    return {
      ...segment,
      fields: [...segment.fields.slice(0, first), ...fields],
    };
  });
  return withoutSpans({ ...message, segments });
}

function canonicalField(field: Field): Field {
  const repetitions = field.repetitions.map((repetition) => ({
    ...repetition,
    components: withoutTrailingEmpty(
      repetition.components.map((component) => ({
        ...component,
        subcomponents: withoutTrailingEmpty(
          component.subcomponents.map((subcomponent): Subcomponent =>
            subcomponent.kind === "value" &&
            subcomponent.value === "" &&
            subcomponent.truncated !== true
              ? { kind: "empty", span: subcomponent.span }
              : subcomponent,
          ),
          (subcomponent) => subcomponent.kind === "empty",
        ),
      })),
      (component) => component.subcomponents.length === 0,
    ),
  }));
  return {
    ...field,
    repetitions: withoutTrailingEmpty(
      repetitions,
      (repetition) => repetition.components.length === 0,
    ),
  };
}

function withoutTrailingEmpty<T>(
  nodes: readonly T[],
  isEmpty: (node: T) => boolean,
): T[] {
  const kept = [...nodes];
  for (
    let last = kept.at(-1);
    last !== undefined && isEmpty(last);
    last = kept.at(-1)
  ) {
    kept.pop();
  }
  return kept;
}
