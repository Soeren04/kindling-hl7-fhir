import { type Span } from "../shared/issue";
import { isString } from "../shared/guards";
import { type Err, err, ok, type Result } from "../shared/result";
import { isValidSegmentId } from "./segment";

/**
 * A path split into its parts. Numbering follows the rule of `Location`: a name ending in `Index` is a 0-based array
 * index, every other position is the 1-based number of HL7 notation. A path names positions only, so all numbers here
 * are 1-based (`PID.5.1` has `field: 5` and `component: 1`; `OBX[3]` is the third `OBX` segment), and {@link get}
 * reads `fields[field - 1]`.
 *
 * Parts the path leaves out are `undefined`: no `segmentOccurrence` selects the first segment with the identifier
 * (`get`) or all of them (`getAll`), no `repetition` the first repetition (`get`) or all (`getAll`), and no
 * `component` or `subcomponent` the first one.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("OBX[3].5.1");
 * if (result.ok) console.log(result.value);
 * // => { segmentId: "OBX", segmentOccurrence: 3, field: 5, repetition: undefined, component: 1, subcomponent: undefined }
 * ```
 */
export interface ParsedPath {
  /** The segment identifier, such as `PID`. */
  readonly segmentId: string;
  /** Which segment of that identifier, counted over the whole message from 1: `3` in `OBX[3]`. */
  readonly segmentOccurrence?: number | undefined;
  /** The field number: `5` in `PID.5`. */
  readonly field: number;
  /** Which repetition of the field, counted from 1: `2` in `PID.3[2]`. */
  readonly repetition?: number | undefined;
  /** The component number: `1` in `PID.5.1`. */
  readonly component?: number | undefined;
  /** The subcomponent number: `2` in `PID.5.1.2`. */
  readonly subcomponent?: number | undefined;
}

/**
 * Why a path could not be read.
 *
 * - `INVALID_INPUT`: the path is not a string.
 * - `EMPTY_PATH`: the path is the empty string.
 * - `INVALID_SEGMENT_ID`: the segment is not three upper-case letters or digits starting with a letter.
 * - `MISSING_FIELD`: there is no field number after the segment, as in `PID`.
 * - `INVALID_NUMBER`: a field, component or subcomponent number is not a positive whole number without leading
 *   zeros, or a component or subcomponent carries a repetition index.
 * - `INVALID_INDEX`: a bracketed repetition index is not a positive whole number, or its brackets are malformed.
 * - `TOO_MANY_PARTS`: the path has more than four parts (segment, field, component, subcomponent).
 */
export type PathFailureCode =
  | "INVALID_INPUT"
  | "EMPTY_PATH"
  | "INVALID_SEGMENT_ID"
  | "MISSING_FIELD"
  | "INVALID_NUMBER"
  | "INVALID_INDEX"
  | "TOO_MANY_PARTS";

/**
 * The reason {@link parsePath} rejected a path.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.x");
 * if (!result.ok) console.error(result.error.code, result.error.span); // => "INVALID_NUMBER", { start: 4, end: 5 }
 * ```
 */
export interface PathFailure {
  /** Discriminant: what is wrong with the path. */
  readonly code: PathFailureCode;
  /** A description of what is wrong with the path; it never repeats the path. */
  readonly message: string;
  /** The offending part of the path, as offsets into the string passed to `parsePath`. */
  readonly span: Span;
}

/**
 * Parses a path such as `PID.5.1`, `PID.3[2].1` or `OBX[3].5` into its parts.
 *
 * The grammar is `SEG[.F[.C[.S]]]` with an optional 1-based repetition index in brackets after the segment and after
 * the field: `SEG[n].F[r].C.S`. A path must name at least a field. `get`, `getAll` and `isNull` use this function and
 * treat a path that fails here as matching nothing; call it to find out why.
 *
 * @param path - The path to parse.
 * @returns The parts of the path, or why it was rejected.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.3[2].1");
 * if (result.ok) console.log(result.value.field, result.value.repetition); // => 3, 2
 * ```
 */
export function parsePath(path: string): Result<ParsedPath, PathFailure> {
  if (!isString(path))
    return pathFailure("INVALID_INPUT", { start: 0, end: 0 });
  const parts = splitParts(path);
  const [segmentPart, fieldPart, componentPart, subcomponentPart, excess] =
    parts;
  if (segmentPart === undefined) {
    return pathFailure("EMPTY_PATH", { start: 0, end: 0 });
  }
  if (excess !== undefined) {
    return pathFailure("TOO_MANY_PARTS", excess.span);
  }

  const segment = readIndexed(segmentPart);
  if (!segment.ok) return segment;
  if (!isValidSegmentId(segment.value.name)) {
    return pathFailure("INVALID_SEGMENT_ID", segmentPart.span);
  }
  if (fieldPart === undefined) {
    return pathFailure("MISSING_FIELD", {
      start: path.length,
      end: path.length,
    });
  }

  const field = readIndexed(fieldPart);
  if (!field.ok) return field;
  const fieldNumber = readNumber(field.value.name, fieldPart.span);
  if (!fieldNumber.ok) return fieldNumber;
  const component = readOptionalNumber(componentPart);
  if (!component.ok) return component;
  const subcomponent = readOptionalNumber(subcomponentPart);
  if (!subcomponent.ok) return subcomponent;

  return ok({
    segmentId: segment.value.name,
    segmentOccurrence: segment.value.index,
    field: fieldNumber.value,
    repetition: field.value.index,
    component: component.value,
    subcomponent: subcomponent.value,
  });
}

/** One dot-separated part of a path and where it is. */
interface Part {
  readonly text: string;
  readonly span: Span;
}

/** The most parts a path has: segment, field, component and subcomponent. */
const maxParts = 4;

/**
 * The dot-separated parts of a path; an empty path has none. Splitting stops after {@link maxParts} parts: whatever
 * follows the last dot is one more part, `excess`, that runs to the end of the path and is not split further, so
 * the work does not grow with the number of dots in a hostile path.
 */
function splitParts(path: string): readonly Part[] {
  const parts: Part[] = [];
  if (path === "") return parts;
  for (let start = 0; ;) {
    const dot = parts.length === maxParts ? -1 : path.indexOf(".", start);
    const end = dot === -1 ? path.length : dot;
    parts.push({ text: path.slice(start, end), span: { start, end } });
    if (dot === -1) return parts;
    start = dot + 1;
  }
}

/** A name with its optional bracketed repetition index. */
interface Indexed {
  readonly name: string;
  readonly index: number | undefined;
}

/** Splits `name[3]` into the name and the index; a part without brackets has no index. */
function readIndexed(part: Part): Result<Indexed, PathFailure> {
  const { text } = part;
  const open = text.indexOf("[");
  const close = text.indexOf("]");
  if (open === -1 && close === -1) return ok({ name: text, index: undefined });
  // Exactly one pair of brackets, the closing one last: the first `]` ends the text and no `[` follows the first.
  const digits = text.slice(open + 1, close);
  const index = toPositiveInteger(digits);
  const bracketed =
    open !== -1 &&
    open < close &&
    close === text.length - 1 &&
    !digits.includes("[");
  if (!bracketed || index === undefined) {
    return pathFailure("INVALID_INDEX", part.span);
  }
  return ok({ name: text.slice(0, open), index });
}

function readOptionalNumber(
  part: Part | undefined,
): Result<number | undefined, PathFailure> {
  return part === undefined ? ok(undefined) : readNumber(part.text, part.span);
}

function readNumber(text: string, span: Span): Result<number, PathFailure> {
  const number = toPositiveInteger(text);
  return number === undefined
    ? pathFailure("INVALID_NUMBER", span)
    : ok(number);
}

/** The most digits a safe integer has; a longer number is rejected without looking at it. */
const maxDigits: number = String(Number.MAX_SAFE_INTEGER).length;

/** The number written by `text` if it is a positive whole number without leading zeros or signs. */
function toPositiveInteger(text: string): number | undefined {
  if (text.length > maxDigits || !/^[1-9]\d*$/u.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : undefined;
}

// One message per code, like the issue messages; a message never repeats the path, which may come from data.
const messages: Readonly<Record<PathFailureCode, string>> = {
  INVALID_INPUT: "The path is not a string.",
  EMPTY_PATH: "The path is empty.",
  INVALID_SEGMENT_ID:
    "A segment identifier is three upper-case letters or digits, starting with a letter.",
  MISSING_FIELD: "A path names a field after the segment, as in PID.5.",
  INVALID_NUMBER:
    "A field, component or subcomponent number is a positive whole number without leading zeros.",
  INVALID_INDEX:
    "A repetition index is a positive whole number in brackets, as in OBX[3].",
  TOO_MANY_PARTS: "A path has at most four parts.",
};

function pathFailure(code: PathFailureCode, span: Span): Err<PathFailure> {
  return err({ code, message: messages[code], span });
}
