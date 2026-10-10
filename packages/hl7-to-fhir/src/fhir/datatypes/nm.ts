// NM to the number of a FHIR Quantity. A FHIR decimal keeps the digits it is written with ("1.50" is a different
// precision than "1.5"), but JSON carries it as a JavaScript number, which does not. A value whose trailing zeros
// after the decimal point would be lost keeps them as the R4 extension `quantity-precision` (the number of significant
// decimal places, on the decimal `Quantity.value`); a value of more than 15 significant digits, which a number cannot
// hold, is reported.
import type { Quantity } from "fhir/r4";

import { isNumber } from "../../hl7v2/validate/formats";
import { compact } from "../compact";
import { type MappingContext, reportIssue, text } from "../context";
import type { MappingCitation } from "../mapping-guide";
import type { Source } from "../source";

/** The guide's map for NM: the number becomes the value of the Quantity. */
export const nmCitation: MappingCitation = {
  conceptMap: "datatype-nm-to-quantity",
  rows: ["NM.1"],
};

/** The R4 core extension that states the number of significant decimal places of a decimal (context: `decimal`). */
const precisionUrl =
  "http://hl7.org/fhir/StructureDefinition/quantity-precision";

/** The most digits a JavaScript number holds without changing the written value. */
const exactDigits = 15;

/** A number as an NM writes it. */
export interface Decimal {
  readonly value: number;
  /** The decimal places the text writes, when it ends in a zero there that the number cannot show. */
  readonly precision: number | undefined;
  /** Whether the text has more significant digits than the number can hold. */
  readonly lossy: boolean;
}

/**
 * The number an NM writes (`+5`, `.5`, `5.`, `007`), or `undefined` when the text is not a number or too large for a
 * JavaScript number.
 *
 * @example
 * ```ts
 * readDecimal("1.50"); // { value: 1.5, precision: 2, lossy: false }
 * readDecimal("1e3"); // undefined, an NM has no exponent
 * ```
 */
export function readDecimal(value: string): Decimal | undefined {
  const number = isNumber(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return undefined;
  const [whole = "", fraction = ""] = value.replace(/^[+-]/u, "").split(".");
  return {
    value: number,
    precision: fraction.endsWith("0") ? fraction.length : undefined,
    lossy:
      significantDigits(`${whole}${fraction}`.replace(/^0+/u, "")) >
      exactDigits,
  };
}

/** The number of digits up to the last one that is not a zero, which is how many of them are significant. */
function significantDigits(digits: string): number {
  let end = digits.length;
  while (end > 0 && digits.charAt(end - 1) === "0") end--;
  return end;
}

/** The Quantity that holds only the number, with its precision where the number cannot show it. */
export function toQuantity({ value, precision }: Decimal): Quantity {
  return compact({
    value,
    _value:
      precision === undefined
        ? undefined
        : { extension: [{ url: precisionUrl, valueInteger: precision }] },
  });
}

/**
 * Maps an NM to a Quantity that holds the number as its value; `undefined` when there is nothing to map or the value
 * is not a number, which is reported as `NON_NUMERIC_VALUE`. A number of more than 15 significant digits is mapped to
 * the nearest number and reported as `NUMBER_PRECISION_LOST`.
 */
export function mapNm(
  context: MappingContext,
  source: Source | undefined,
): Quantity | undefined {
  const value = text(context, source);
  if (source === undefined || value === undefined) return undefined;
  const decimal = readDecimal(value);
  if (decimal === undefined) {
    reportIssue(context, "NON_NUMERIC_VALUE", source.location, value);
    return undefined;
  }
  if (decimal.lossy) {
    reportIssue(context, "NUMBER_PRECISION_LOST", source.location, value);
  }
  return toQuantity(decimal);
}
