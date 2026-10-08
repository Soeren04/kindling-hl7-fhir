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
 * The check is shallow on purpose: it does not know which segments and fields exist, so `PID.99` passes, and it
 * costs a few type instantiations per literal. Strings that are not literals (variables, template strings) always
 * pass.
 *
 * @typeParam P - The path to check; inferred from the argument by `get`, `getAll` and `isNull`.
 *
 * @example
 * ```ts
 * import type { Hl7Path } from "hl7-to-fhir/hl7v2";
 *
 * const name: Hl7Path = "PID.5.1";
 * const checked: Hl7Path<"OBX[3].5"> = "OBX[3].5";
 * // const broken: Hl7Path<"PID..5"> = "PID..5"; // error: Invalid HL7 path: ...
 * ```
 */
export type Hl7Path<P extends string = string> = string extends P
  ? string
  : Problem<P> extends infer Reason extends string
    ? [Reason] extends [""]
      ? P
      : `Invalid HL7 path: ${Reason}`
    : never;

/** What is wrong with a path literal: the empty string when nothing is. */
type Problem<P extends string> = P extends `${infer Segment}.${infer Rest}`
  ? SegmentProblem<Segment> extends ""
    ? FieldProblem<Rest>
    : SegmentProblem<Segment>
  : "a field number must follow the segment, as in PID.5";

type SegmentProblem<S extends string> = S extends `${infer Id}[${infer Index}]`
  ? IdProblem<Id> extends ""
    ? IndexProblem<Index>
    : IdProblem<Id>
  : IdProblem<S>;

/** An identifier has three characters and no lower-case letters. */
type IdProblem<Id extends string> = string extends Id
  ? ""
  : Id extends `${string}${string}${string}${infer Rest}`
    ? Rest extends ""
      ? Id extends Uppercase<Id>
        ? ""
        : "the segment identifier must be upper case"
      : "the segment identifier has three characters"
    : "the segment identifier has three characters";

type FieldProblem<R extends string> = R extends `${infer Field}.${infer Rest}`
  ? NumberedProblem<Field, "field"> extends ""
    ? ComponentProblem<Rest>
    : NumberedProblem<Field, "field">
  : NumberedProblem<R, "field">;

type ComponentProblem<R extends string> =
  R extends `${infer Component}.${infer Subcomponent}`
    ? NumberProblem<Component, "component"> extends ""
      ? NumberProblem<Subcomponent, "subcomponent">
      : NumberProblem<Component, "component">
    : NumberProblem<R, "component">;

/** A field with an optional repetition index in brackets. */
type NumberedProblem<
  F extends string,
  What extends string,
> = F extends `${infer Number}[${infer Index}]`
  ? NumberProblem<Number, What> extends ""
    ? IndexProblem<Index>
    : NumberProblem<Number, What>
  : NumberProblem<F, What>;

type IndexProblem<Index extends string> = NumberProblem<
  Index,
  "repetition index"
>;

/** A positive whole number: digits only, not starting with zero. */
type NumberProblem<N extends string, What extends string> = string extends N
  ? ""
  : N extends `0${string}`
    ? `a ${What} is a positive number without leading zeros`
    : DigitsOnly<N> extends true
      ? ""
      : `a ${What} is a positive number`;

type DigitsOnly<N extends string> = N extends `${infer Head}${infer Tail}`
  ? Head extends "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
    ? Tail extends ""
      ? true
      : DigitsOnly<Tail>
    : false
  : false;
