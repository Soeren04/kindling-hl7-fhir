/**
 * A path in HL7 notation: `PID.5`, `PID.5.1`, `PID.3[2].1`, `OBX[3].5`. See `get` for what a path selects.
 *
 * As a plain type, `Hl7Path` is `string`: any string is accepted at runtime, and one that is not a valid path matches
 * nothing (`parsePath` explains why). With a type argument, it checks the shape of a string literal and rejects
 * obvious mistakes while you type:
 *
 * - the segment is three upper-case letters or digits, optionally followed by an index such as `[2]`,
 * - a field number follows the segment, and component and subcomponent numbers may follow it,
 * - every number is a positive whole number without leading zeros, and only the segment and the field take an index.
 *
 * The check is shallow on purpose: it does not know which segments and fields exist, so `PID.99` and `ZPI.3` pass,
 * and it costs a few type instantiations per literal. Strings that are not literals (variables, template strings)
 * always pass. Where `get`, `getAll` and `isNull` take a path, the editor also offers every `KnownPath` while
 * you type, so the fields of the defined segments complete without limiting the paths that are accepted.
 *
 * @typeParam P - The path to check; inferred from the argument by `get`, `getAll` and `isNull`. A malformed literal
 * becomes a string type that carries the reason in its `invalidHl7Path` property, so the compiler's message names it.
 *
 * @example
 * ```ts
 * import { get, parse, type Hl7Path } from "hl7-to-fhir/hl7v2";
 *
 * const name: Hl7Path = "PID.5.1";
 * const checked: Hl7Path<"OBX[3].5"> = "OBX[3].5";
 * // const broken: Hl7Path<"PID..5"> = "PID..5"; // error: ... "a field is a positive number"
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||||Everyman^Adam");
 * if (result.ok) {
 *   get(result.value.message, name); // => "Everyman"
 *   get(result.value.message, "ZPI.3"); // => undefined
 * }
 * ```
 */
export type Hl7Path<P extends string = string> = string extends P
  ? string
  : Invalid<P> extends infer Reason extends string
    ? [Reason] extends [""]
      ? P
      : string & { readonly invalidHl7Path: Reason }
    : never;

// The names after `infer` are local to each type, but the declaration bundler puts every type of the package into
// one scope and renames a clash to `Name$1`. The names below therefore end in `Text`, `Digit` or `Remainder`, which
// no declaration of the package uses (`check:api` fails on a `$1` in the declarations).

/** What is wrong with a path literal: the empty string when nothing is. */
type Invalid<P extends string> =
  P extends `${infer SegmentText}.${infer Remainder}`
    ? InvalidSegment<SegmentText> extends ""
      ? InvalidField<Remainder>
      : InvalidSegment<SegmentText>
    : "a field number must follow the segment, as in PID.5";

type InvalidSegment<S extends string> =
  S extends `${infer IdText}[${infer IndexText}]`
    ? InvalidId<IdText> extends ""
      ? InvalidIndex<IndexText>
      : InvalidId<IdText>
    : InvalidId<S>;

/** An identifier has three characters and no lower-case letters. */
type InvalidId<Id extends string> = string extends Id
  ? ""
  : Id extends `${string}${string}${string}${infer Remainder}`
    ? Remainder extends ""
      ? Id extends Uppercase<Id>
        ? ""
        : "the segment identifier must be upper case"
      : "the segment identifier has three characters"
    : "the segment identifier has three characters";

type InvalidField<R extends string> =
  R extends `${infer FieldText}.${infer Remainder}`
    ? InvalidNumbered<FieldText, "field"> extends ""
      ? InvalidComponent<Remainder>
      : InvalidNumbered<FieldText, "field">
    : InvalidNumbered<R, "field">;

type InvalidComponent<R extends string> =
  R extends `${infer ComponentText}.${infer SubcomponentText}`
    ? InvalidNumber<ComponentText, "component"> extends ""
      ? InvalidNumber<SubcomponentText, "subcomponent">
      : InvalidNumber<ComponentText, "component">
    : InvalidNumber<R, "component">;

/** A number with an optional repetition index in brackets. */
type InvalidNumbered<
  N extends string,
  What extends string,
> = N extends `${infer NumberText}[${infer IndexText}]`
  ? InvalidNumber<NumberText, What> extends ""
    ? InvalidIndex<IndexText>
    : InvalidNumber<NumberText, What>
  : InvalidNumber<N, What>;

type InvalidIndex<Index extends string> = InvalidNumber<
  Index,
  "repetition index"
>;

/** A positive whole number: digits only, not starting with zero. */
type InvalidNumber<N extends string, What extends string> = string extends N
  ? ""
  : N extends `0${string}`
    ? `a ${What} is a positive number without leading zeros`
    : OnlyDigits<N> extends true
      ? ""
      : `a ${What} is a positive number`;

type OnlyDigits<N extends string> = N extends `${infer Digit}${infer Remainder}`
  ? Digit extends "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
    ? Remainder extends ""
      ? true
      : OnlyDigits<Remainder>
    : false
  : false;
