import fc from "fast-check";

import type {
  Component,
  Delimiters,
  Field,
  Hl7Message,
  Repetition,
  Segment,
  Subcomponent,
} from "../../src/hl7v2/model";

/** Every character that may serve as a delimiter: printable ASCII that is neither a letter nor a digit. */
export const punctuation: readonly string[] = Array.from(
  String.raw`!"#$%&'()*+,-./:;<=>?@[\]^_` + "`{|}~",
);

/** Random sets of five distinct delimiters, without a truncation character. */
export const delimiterSets: fc.Arbitrary<Delimiters> = fc
  .shuffledSubarray([...punctuation], { minLength: 5, maxLength: 5 })
  .map(
    ([
      field = "",
      component = "",
      repetition = "",
      escape = "",
      subcomponent = "",
    ]) => ({
      field,
      component,
      repetition,
      escape,
      subcomponent,
    }),
  );

const noSpan = { start: 0, end: 0 };

/**
 * A list that is empty or ends in a `last` element, like the lists `parse` produces by trimming trailing empty
 * children. Only trees of this shape come back unchanged from a round trip.
 */
function trimmedList<T>(
  item: fc.Arbitrary<T>,
  last: fc.Arbitrary<T>,
): fc.Arbitrary<readonly T[]> {
  return fc.oneof(
    fc.constant<readonly T[]>([]),
    fc
      .tuple(fc.array(item, { maxLength: 2 }), last)
      .map(([leading, final]) => [...leading, final]),
  );
}

function subcomponents(delimiters: Delimiters): {
  readonly any: fc.Arbitrary<Subcomponent>;
  readonly filled: fc.Arbitrary<Subcomponent>;
} {
  // Values may contain every delimiter, quotes, line breaks and a period (never a delimiter here). They are never
  // empty: an empty value only arises from removed formatting commands, which `stringify` cannot reproduce.
  const text = fc.string({
    unit: fc.constantFrom(
      ...Array.from(`ab .,"\n\ré`),
      ...[
        delimiters.field,
        delimiters.component,
        delimiters.repetition,
        delimiters.escape,
        delimiters.subcomponent,
        ...(delimiters.truncation === undefined ? [] : [delimiters.truncation]),
      ],
    ),
    minLength: 1,
    maxLength: 6,
  });
  const filled = fc.oneof(
    text.map((value): Subcomponent => ({ kind: "value", value, span: noSpan })),
    fc.constant<Subcomponent>({ kind: "null", span: noSpan }),
  );
  const any = fc.oneof(
    { weight: 4, arbitrary: filled },
    {
      weight: 1,
      arbitrary: fc.constant<Subcomponent>({ kind: "empty", span: noSpan }),
    },
  );
  return { any, filled };
}

function fields(delimiters: Delimiters): fc.Arbitrary<Field> {
  const subcomponent = subcomponents(delimiters);
  const component = trimmedList(subcomponent.any, subcomponent.filled).map(
    (children): Component => ({ subcomponents: children, span: noSpan }),
  );
  const filledComponent = component.filter(
    (node) => node.subcomponents.length > 0,
  );
  const repetition = trimmedList(component, filledComponent).map(
    (children): Repetition => ({ components: children, span: noSpan }),
  );
  const filledRepetition = repetition.filter(
    (node) => node.components.length > 0,
  );
  return trimmedList(repetition, filledRepetition).map((children): Field => ({
    repetitions: children,
    span: noSpan,
  }));
}

/** A field holding one value, like MSH-1, MSH-2 and the version. */
function singleValue(value: string): Field {
  const subcomponent: Subcomponent = { kind: "value", value, span: noSpan };
  return {
    span: noSpan,
    repetitions: [
      {
        span: noSpan,
        components: [{ span: noSpan, subcomponents: [subcomponent] }],
      },
    ],
  };
}

// The period would end MSH-12 inside the version "2.5.1" when it is a delimiter, and the quote would turn the HL7
// null `""` into two delimiters.
const delimiterCharacters = punctuation.filter(
  (character) => character !== "." && character !== '"',
);

/**
 * Random messages in the shape `parse` returns: an MSH segment with its version, then segments with arbitrary
 * fields, repetitions, components and subcomponents (values, nulls and empty ones in the middle), under random sets
 * of distinct delimiters. Some messages declare a truncation character, which needs version 2.7 or later.
 *
 * The last segment is a fixed Z segment: `parse` strips whitespace at the end of the text, which would otherwise
 * change a final value that ends in a space.
 *
 * All spans are empty, so compare trees with the spans removed.
 */
export const hl7Messages: fc.Arbitrary<Hl7Message> = fc
  .tuple(
    fc.shuffledSubarray(delimiterCharacters, { minLength: 6, maxLength: 6 }),
    fc.boolean(),
  )
  .chain(([characters, truncating]) => {
    const [
      field = "",
      component = "",
      repetition = "",
      escape = "",
      subcomponent = "",
      truncation = "",
    ] = characters;
    const delimiters: Delimiters = {
      field,
      component,
      repetition,
      escape,
      subcomponent,
      ...(truncating ? { truncation } : {}),
    };
    const encoding = `${component}${repetition}${escape}${subcomponent}${truncating ? truncation : ""}`;
    const anyField = fields(delimiters);
    const segment = fc.tuple(
      fc.constantFrom("PID", "OBX", "NTE", "ZPI"),
      trimmedList(
        anyField,
        anyField.filter((node) => node.repetitions.length > 0),
      ),
    );
    // MSH-3 to MSH-11, then MSH-12 with the version.
    return fc
      .tuple(
        fc.array(fields(delimiters), { minLength: 9, maxLength: 9 }),
        truncating
          ? fc.constant("2.8.2")
          : fc.constantFrom("2.3", "2.5.1", "2.6"),
        fc.array(segment, { maxLength: 4 }),
      )
      .map(([header, version, others]): Hl7Message => {
        const msh: Segment = {
          id: "MSH",
          span: noSpan,
          fields: [
            singleValue(field),
            singleValue(encoding),
            ...header,
            singleValue(version),
          ],
        };
        const segments: Segment[] = [
          msh,
          ...others.map(([id, children]) => ({
            id,
            fields: children,
            span: noSpan,
          })),
          { id: "ZZZ", fields: [singleValue("end")], span: noSpan },
        ];
        return { delimiters, version, segments };
      });
  });
