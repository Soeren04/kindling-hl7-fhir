// SN (structured numeric) to a Quantity with comparator, a Range or a Ratio, chosen by the separator SN.3: none for a
// single number (`>^100`), `-` for a range (`^10^-^20`), `:` or `/` for a ratio (`^1^:^128`). The other separators
// (`+` for categorical results such as `2+`, `.` for sections) and the comparator `<>` have no FHIR equivalent, and a
// range must not run from a larger to a smaller number (FHIR invariant rng-2).
import type { Quantity, Range, Ratio } from "fhir/r4";

import type { Location } from "../../shared/issue";
import { compact } from "../compact";
import { type MappingContext, present, reportIssue, text } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { type Decimal, readDecimal, toQuantity } from "./nm";

/** The guide's maps for SN, one per FHIR type. */
export const snCitations: readonly MappingCitation[] = [
  { conceptMap: "datatype-sn-to-quantity", rows: ["SN.1", "SN.2"] },
  { conceptMap: "datatype-sn-to-range", rows: ["SN.2", "SN.4"] },
  { conceptMap: "datatype-sn-to-ratio", rows: ["SN.1", "SN.2", "SN.4"] },
];

/** A structured numeric as the FHIR type its separator calls for. */
export type StructuredNumeric =
  | { readonly kind: "quantity"; readonly quantity: Quantity }
  | { readonly kind: "range"; readonly range: Range }
  | { readonly kind: "ratio"; readonly ratio: Ratio };

type Comparator = NonNullable<Quantity["comparator"]>;

const comparators: ReadonlyMap<string, Comparator | undefined> = new Map([
  ["=", undefined],
  ["<", "<"],
  ["<=", "<="],
  [">", ">"],
  [">=", ">="],
]);

/** One part of an SN with its text, the number the text writes, if it is one, and its location. */
interface Piece {
  readonly text: string | undefined;
  readonly decimal: Decimal | undefined;
  readonly location: Location;
}

/** Why an SN has no FHIR equivalent: the part FHIR cannot express, or numbers that are missing or in the wrong order. */
type Unsupported = "comparator" | "separator" | "numbers" | "order";

/**
 * Maps an SN to a Quantity, Range or Ratio; `undefined` when there is nothing to map or FHIR cannot express it
 * (`STRUCTURED_NUMERIC_UNSUPPORTED`), or a number is not one (`NON_NUMERIC_VALUE`).
 */
export function mapSn(
  context: MappingContext,
  source: Source | undefined,
): StructuredNumeric | undefined {
  const value = present(context, source);
  if (value === undefined) return undefined;
  const piece = (n: number): Piece => {
    const found = part(value, n);
    const written = text(context, found);
    return {
      text: written,
      decimal: written === undefined ? undefined : readDecimal(written),
      location: found?.location ?? value.location,
    };
  };
  const [comparator, first, separator, second] = [
    piece(1),
    piece(2),
    piece(3),
    piece(4),
  ];
  if ([comparator, first, separator, second].every(isEmpty)) return undefined;
  const nonNumeric = [first, second].filter(
    (number) => number.text !== undefined && number.decimal === undefined,
  );
  for (const number of nonNumeric) {
    reportIssue(context, "NON_NUMERIC_VALUE", number.location, number.text);
  }
  if (nonNumeric.length > 0) return undefined;
  const result = structure(
    comparator.text,
    first.decimal,
    separator.text,
    second.decimal,
  );
  if (typeof result === "object") {
    for (const number of [first, second]) {
      if (number.decimal?.lossy === true) {
        reportIssue(
          context,
          "NUMBER_PRECISION_LOST",
          number.location,
          number.text,
        );
      }
    }
    return result;
  }
  // The piece FHIR cannot express, or the whole value when the numbers do not fit.
  const culprit =
    result === "comparator"
      ? comparator
      : result === "separator"
        ? separator
        : { text: undefined, location: value.location };
  reportIssue(
    context,
    "STRUCTURED_NUMERIC_UNSUPPORTED",
    culprit.location,
    culprit.text,
  );
  return undefined;
}

/** The FHIR type of an SN, or what FHIR cannot express of it. */
function structure(
  comparatorText: string | undefined,
  low: Decimal | undefined,
  separator: string | undefined,
  high: Decimal | undefined,
): StructuredNumeric | Unsupported {
  if (comparatorText !== undefined && !comparators.has(comparatorText)) {
    return "comparator";
  }
  const comparator =
    comparatorText === undefined ? undefined : comparators.get(comparatorText);
  switch (separator) {
    case undefined:
      return low === undefined || high !== undefined
        ? "numbers"
        : { kind: "quantity", quantity: quantity(low, comparator) };
    case "-":
      if (comparator !== undefined) return "comparator";
      if (low === undefined && high === undefined) return "numbers";
      if (low !== undefined && high !== undefined && low.value > high.value) {
        return "order";
      }
      return {
        kind: "range",
        range: compact({
          low: low === undefined ? undefined : toQuantity(low),
          high: high === undefined ? undefined : toQuantity(high),
        }),
      };
    case ":":
    case "/":
      return low === undefined || high === undefined
        ? "numbers"
        : {
            kind: "ratio",
            ratio: {
              numerator: quantity(low, comparator),
              denominator: toQuantity(high),
            },
          };
    default:
      return "separator";
  }
}

function isEmpty(piece: Piece): boolean {
  return piece.text === undefined;
}

function quantity(
  number: Decimal,
  comparator: Comparator | undefined,
): Quantity {
  return compact({ ...toQuantity(number), comparator });
}
