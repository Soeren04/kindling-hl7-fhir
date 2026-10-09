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

/** Which trailing encoding characters a message omits: none, the subcomponent separator, or it and the escape. */
type Omission = "none" | "subcomponent" | "escape and subcomponent";

const omissions = fc.constantFrom<Omission>(
  "none",
  "subcomponent",
  "escape and subcomponent",
);

/**
 * Delimiters from the given distinct characters, leaving out the omitted ones as `parse` does: absent, not
 * `undefined`.
 */
function delimitersOf(
  [
    field = "",
    component = "",
    repetition = "",
    escape = "",
    subcomponent = "",
  ]: readonly string[],
  omission: Omission,
): Delimiters {
  return {
    field,
    component,
    repetition,
    ...(omission === "escape and subcomponent" ? {} : { escape }),
    ...(omission === "none" ? { subcomponent } : {}),
  };
}

/** The MSH-2 that declares `delimiters`, without a truncation character. */
export function encodingCharactersOf(delimiters: Delimiters): string {
  const { component, repetition, escape = "", subcomponent = "" } = delimiters;
  return component + repetition + escape + subcomponent;
}

/** Random sets of five distinct delimiters, without a truncation character. */
export const completeDelimiterSets: fc.Arbitrary<Delimiters> = fc
  .shuffledSubarray([...punctuation], { minLength: 5, maxLength: 5 })
  .map((characters) => delimitersOf(characters, "none"));

/** Random sets of distinct delimiters that may omit the subcomponent separator, or it and the escape character. */
export const delimiterSets: fc.Arbitrary<Delimiters> = fc
  .tuple(
    fc.shuffledSubarray([...punctuation], { minLength: 5, maxLength: 5 }),
    omissions,
  )
  .map(([characters, omission]) => delimitersOf(characters, omission));

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

/** Where generated fields go: in MSH, a line feed always needs an escape sequence, as it would end the segment. */
type Place = "header" | "body";

function subcomponents(
  delimiters: Delimiters,
  place: Place,
): {
  readonly any: fc.Arbitrary<Subcomponent>;
  readonly filled: fc.Arbitrary<Subcomponent>;
} {
  // With an escape character, values may contain every delimiter, quotes, line breaks and a period (never a
  // delimiter here). Without one, they hold only what needs no escape sequence, and line feeds outside MSH. They are
  // never empty: an empty value only arises from removed formatting commands, which `stringify` cannot reproduce.
  const { field, component, repetition, escape, subcomponent, truncation } =
    delimiters;
  const declared = [
    field,
    component,
    repetition,
    escape,
    subcomponent,
    truncation,
  ].filter((character) => character !== undefined);
  const text = fc
    .string({
      unit: fc.constantFrom(
        ...Array.from(`ab .,"é`).filter((c) => !declared.includes(c)),
        ...(escape === undefined ? [] : ["\n", "\r", ...declared]),
        ...(escape === undefined && place === "body" ? ["\n"] : []),
      ),
      minLength: 1,
      maxLength: 6,
    })
    .filter((value) => escape !== undefined || value !== '""');
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

function fields(delimiters: Delimiters, place: Place): fc.Arbitrary<Field> {
  const subcomponent = subcomponents(delimiters, place);
  // Without a subcomponent separator, a component holds at most one subcomponent.
  const children =
    delimiters.subcomponent === undefined
      ? fc.oneof(
          fc.constant<readonly Subcomponent[]>([]),
          subcomponent.filled.map((child) => [child]),
        )
      : trimmedList(subcomponent.any, subcomponent.filled);
  const component = children.map((list): Component => ({
    subcomponents: list,
    span: noSpan,
  }));
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
 * of distinct delimiters, some of which omit the subcomponent separator or it and the escape character. Some
 * messages declare a truncation character, which needs version 2.7 or later.
 *
 * All spans are empty, so compare trees with the spans removed.
 */
export const hl7Messages: fc.Arbitrary<Hl7Message> = fc
  .tuple(
    fc.shuffledSubarray(delimiterCharacters, { minLength: 6, maxLength: 6 }),
    omissions,
    fc.boolean(),
  )
  .chain(([characters, omission, wantsTruncation]) => {
    // A truncation character follows all four other encoding characters in MSH-2.
    const truncating = wantsTruncation && omission === "none";
    const truncation = characters[5] ?? "";
    const delimiters: Delimiters = {
      ...delimitersOf(characters, omission),
      ...(truncating ? { truncation } : {}),
    };
    const encoding =
      encodingCharactersOf(delimiters) + (truncating ? truncation : "");
    const { field } = delimiters;
    const anyField = fields(delimiters, "body");
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
        fc.array(fields(delimiters, "header"), { minLength: 9, maxLength: 9 }),
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
        ];
        return { delimiters, version, segments };
      });
  });
