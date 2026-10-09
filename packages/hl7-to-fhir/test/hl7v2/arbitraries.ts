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

/** What the generated values may contain besides the delimiters. */
interface ValueRules {
  readonly delimiters: Delimiters;
  readonly place: Place;
  /** Whether the character set has hexadecimal escapes, which carriage returns and the value `""` need. */
  readonly hexEscapes: boolean;
}

function subcomponents({ delimiters, place, hexEscapes }: ValueRules): {
  readonly any: fc.Arbitrary<Subcomponent>;
  readonly filled: fc.Arbitrary<Subcomponent>;
} {
  // With an escape character, values may contain every delimiter, quotes, line breaks and a period (never a
  // delimiter here); carriage returns need a hexadecimal escape too. Without one, they hold only what needs no escape
  // sequence, and line feeds outside MSH. MLLP end blocks, spaces and tabs may end a value, also at the end of the
  // message. Values are never empty: an empty value only arises from removed formatting commands, which `stringify`
  // writes as an empty subcomponent.
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
        ...Array.from(`ab .,"é\t\u001C`).filter((c) => !declared.includes(c)),
        ...(escape === undefined ? [] : ["\n", ...declared]),
        ...(escape !== undefined && hexEscapes ? ["\r"] : []),
        ...(escape === undefined && place === "body" ? ["\n"] : []),
      ),
      minLength: 1,
      maxLength: 6,
    })
    .filter((value) => (escape !== undefined && hexEscapes) || value !== '""');
  // Values may be marked as truncated where the message declares a truncation character.
  const truncated =
    truncation === undefined ? fc.constant(false) : fc.boolean();
  const filled = fc.oneof(
    fc
      .tuple(text, truncated)
      .map(([value, cut]): Subcomponent =>
        cut
          ? { kind: "value", value, truncated: true, span: noSpan }
          : { kind: "value", value, span: noSpan },
      ),
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

function fields(rules: ValueRules): fc.Arbitrary<Field> {
  const { delimiters } = rules;
  const subcomponent = subcomponents(rules);
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

/** The fields without the empty ones at the end, which `parse` trims. */
function withoutTrailingEmpty(list: readonly Field[]): readonly Field[] {
  let end = list.length;
  while (end > 0 && list[end - 1]?.repetitions.length === 0) end--;
  return list.slice(0, end);
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

/** The character sets of HL7 table 0211 whose code units are wider than a byte, so they have no ASCII hex escapes. */
const withoutHexEscapes: readonly string[] = [
  "UNICODE",
  "UNICODE UTF-16",
  "UNICODE UTF-32",
];

/** Character sets of HL7 table 0211 that the generated messages declare in MSH-18. */
const characterSets: readonly string[] = [
  "ASCII",
  "8859/1",
  "8859/2",
  "UNICODE UTF-8",
  "ISO IR14",
  "ISO IR87",
  "ISO IR159",
  "GB 18030-2000",
  "KS X 1001",
  "CNS 11643-1992",
  "BIG-5",
  ...withoutHexEscapes,
];

/**
 * Random messages in the shape `parse` returns: an MSH segment with its version, then segments with arbitrary
 * fields, repetitions, components and subcomponents (values, nulls and empty ones in the middle), under random sets
 * of distinct delimiters, some of which omit the subcomponent separator or it and the escape character. Some
 * messages declare a truncation character, which needs version 2.7 or later, and some values are truncated; header
 * fields go up to MSH-18, the character set, which may be one without hexadecimal escapes (UTF-16 and UTF-32), where
 * values hold no carriage return and are never `""`.
 *
 * All spans are empty, so compare trees with the spans removed.
 */
export const hl7Messages: fc.Arbitrary<Hl7Message> = fc
  .tuple(
    fc.shuffledSubarray(delimiterCharacters, { minLength: 6, maxLength: 6 }),
    omissions,
    fc.boolean(),
    fc.option(fc.constantFrom(...characterSets), { nil: undefined }),
  )
  .chain(([characters, omission, wantsTruncation, wantedCharset]) => {
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
    // A name that holds a delimiter would be cut apart where parse reads it raw.
    const charset = characters.some((character) =>
      wantedCharset?.includes(character),
    )
      ? undefined
      : wantedCharset;
    const hexEscapes = !withoutHexEscapes.includes(charset ?? "");
    const anyField = fields({ delimiters, place: "body", hexEscapes });
    const segment = fc.tuple(
      fc.constantFrom("PID", "OBX", "NTE", "ZPI"),
      trimmedList(
        anyField,
        anyField.filter((node) => node.repetitions.length > 0),
      ),
    );
    // MSH-3 to MSH-11, MSH-12 with the version, MSH-13 to MSH-17, and MSH-18 with a character set that may be
    // omitted. The versions span both sides of 2.7, where the truncation character was introduced.
    const headerFields = (count: number) =>
      fc.array(fields({ delimiters, place: "header", hexEscapes }), {
        minLength: count,
        maxLength: count,
      });
    return fc
      .tuple(
        headerFields(9),
        truncating
          ? fc.constantFrom("2.7", "2.8.2", "2.10")
          : fc.constantFrom("2.3", "2.5.1", "2.6", "2.8"),
        headerFields(5),
        fc.array(segment, { maxLength: 4 }),
      )
      .map(([before, version, after, others]): Hl7Message => {
        const rest =
          charset === undefined
            ? withoutTrailingEmpty(after)
            : [...after, singleValue(charset)];
        const msh: Segment = {
          id: "MSH",
          span: noSpan,
          fields: [
            singleValue(field),
            singleValue(encoding),
            ...before,
            singleValue(version),
            ...rest,
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
