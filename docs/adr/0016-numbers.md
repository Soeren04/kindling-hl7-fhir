# 0016. Numbers

- Status: accepted
- Date: 2026-10-10
- Implementation: partial (`mapNm` and `mapSn` in `src/fhir/datatypes/`; the resource mappers of phase 3, which put
  the quantities into observations, follow)

## Context

An HL7 v2 number (NM) is a string of digits with an optional sign and decimal point (`1.50`, `007`, `.5`). A FHIR
`decimal` is also a string of digits, and FHIR says that the digits matter: `1.50` states a precision that `1.5` does
not, and a receiver must keep it. FHIR in JSON, though, writes a decimal as a JSON number, and in JavaScript a JSON
number is an IEEE 754 double, which keeps neither trailing zeros nor more than about 15 significant digits. Two things
get lost on the way:

- the trailing zeros after the decimal point (`1.50`, `5.0`): a laboratory result of `5.0` mmol/L is not the same
  claim as `5`;
- the digits beyond the 15th, which change the number (`12345678901234567` becomes `12345678901234568`).

## Decision

- **A number maps to the `value` of a Quantity** (`mapNm`, and the numbers of `mapSn`), not to a bare `number`, so the
  precision has a place to go.
- **Trailing zeros after the decimal point are kept** as the R4 core extension
  [`quantity-precision`](https://hl7.org/fhir/R4/extension-quantity-precision.html) (`valueInteger`: the number of
  decimal places, `2` for `1.50`) on `Quantity.value`, written in JSON as `_value`. Its context is the `decimal` type,
  so it belongs on the decimal element. The extension is added only where the number cannot show the places by itself
  (`1.5` and `100` carry none).
- **More than 15 significant digits** are mapped to the nearest double and reported as `NUMBER_PRECISION_LOST`
  (warning) with the original text as the value. The number is used and not left out, because the nearest number is
  closer to what the sender said than no number.
- **Structured numerics** (SN) use the same rules for each number. A range from a larger to a smaller number
  (`^20^-^10`) violates FHIR's invariant rng-2 and is reported as `STRUCTURED_NUMERIC_UNSUPPORTED` and left out.

## Alternatives considered

- **A string for the decimal.** FHIR JSON does not allow it, and every FHIR library reads a decimal from a number.
- **Dropping the zeros silently.** What most converters do; a lab value loses its stated precision without a trace.
- **Throwing away numbers of more than 15 digits.** Loses the value, where the nearest double is usually enough.
- **A big-number type.** The library's output is plain JSON that `JSON.stringify` writes; a decimal type would not
  survive it.

## Consequences

- Quantities with trailing zeros carry an extension that receivers who ignore it simply do not see; the value is
  correct either way.
- A user sees which numbers lost digits and which kept their precision only by the extension; the issue list says
  where digits were lost.
