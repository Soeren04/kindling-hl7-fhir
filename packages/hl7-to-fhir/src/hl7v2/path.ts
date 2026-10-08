import { isString, type Span } from "../shared/issue";
import { type Err, err, ok, type Result } from "../shared/result";
import { isValidSegmentId } from "./segment";

/**
 * A path split into its parts. Numbers are 1-based, as written in HL7 notation (`PID.5.1` has `field: 5` and
 * `component: 1`); {@link get} applies the `n - 1` that ADR 0008 prescribes for the arrays.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("OBX[3].5.1");
 * // { segment: "OBX", segmentIndex: 3, field: 5, fieldIndex: undefined, component: 1, subcomponent: undefined }
 * ```
 */
export interface ParsedPath {
  /** The segment identifier, such as `PID`. */
  readonly segment: string;
  /** Which segment of that identifier, counted over the whole message; `undefined` selects the first (`get`) or all (`getAll`). */
  readonly segmentIndex: number | undefined;
  /** The field number: `5` in `PID.5`. */
  readonly field: number;
  /** Which repetition of the field; `undefined` selects the first (`get`) or all (`getAll`). */
  readonly fieldIndex: number | undefined;
  /** The component number; `undefined` selects the first component. */
  readonly component: number | undefined;
  /** The subcomponent number; `undefined` selects the first subcomponent. */
  readonly subcomponent: number | undefined;
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
export type PathErrorCode =
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
 * if (!result.ok) console.error(result.error.code, result.error.span); // "INVALID_NUMBER", { start: 4, end: 5 }
 * ```
 */
export interface PathError {
  /** Discriminant: what is wrong with the path. */
  readonly code: PathErrorCode;
  /** A description of the problem. */
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
 * @returns The parts of the path, or the first problem found.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.3[2].1");
 * if (result.ok) console.log(result.value.field, result.value.fieldIndex); // 3 2
 * ```
 */
export function parsePath(path: string): Result<ParsedPath, PathError> {
  if (!isString(path)) return fail("INVALID_INPUT", { start: 0, end: 0 });
  const parts = splitParts(path);
  const [segmentPart, fieldPart, componentPart, subcomponentPart] = parts;
  if (segmentPart === undefined) {
    return fail("EMPTY_PATH", { start: 0, end: 0 });
  }
  if (subcomponentPart !== undefined && parts.length > 4) {
    return fail("TOO_MANY_PARTS", {
      start: subcomponentPart.span.end + 1,
      end: path.length,
    });
  }

  const segment = readIndexed(segmentPart);
  if (!segment.ok) return segment;
  if (!isValidSegmentId(segment.value.name)) {
    return fail("INVALID_SEGMENT_ID", segmentPart.span);
  }
  if (fieldPart === undefined) {
    return fail("MISSING_FIELD", { start: path.length, end: path.length });
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
    segment: segment.value.name,
    segmentIndex: segment.value.index,
    field: fieldNumber.value,
    fieldIndex: field.value.index,
    component: component.value,
    subcomponent: subcomponent.value,
  });
}

/** One dot-separated part of a path and where it is. */
interface Part {
  readonly text: string;
  readonly span: Span;
}

/** The dot-separated parts of a path; an empty path has none. */
function splitParts(path: string): readonly Part[] {
  const parts: Part[] = [];
  if (path === "") return parts;
  let start = 0;
  for (const text of path.split(".")) {
    parts.push({ text, span: { start, end: start + text.length } });
    start += text.length + 1;
  }
  return parts;
}

/** A name with its optional bracketed repetition index. */
interface Indexed {
  readonly name: string;
  readonly index: number | undefined;
}

/** Splits `name[3]` into the name and the index; a part without brackets has no index. */
function readIndexed(part: Part): Result<Indexed, PathError> {
  if (!/[[\]]/u.test(part.text))
    return ok({ name: part.text, index: undefined });
  const match = /^([^[\]]*)\[([^[\]]*)\]$/u.exec(part.text);
  const index = toPositiveInteger(match?.[2] ?? "");
  if (match === null || index === undefined) {
    return fail("INVALID_INDEX", part.span);
  }
  return ok({ name: match[1] ?? "", index });
}

function readOptionalNumber(
  part: Part | undefined,
): Result<number | undefined, PathError> {
  return part === undefined ? ok(undefined) : readNumber(part.text, part.span);
}

function readNumber(text: string, span: Span): Result<number, PathError> {
  const number = toPositiveInteger(text);
  return number === undefined ? fail("INVALID_NUMBER", span) : ok(number);
}

/** The number written by `text` if it is a positive whole number without leading zeros or signs. */
function toPositiveInteger(text: string): number | undefined {
  if (!/^[1-9]\d*$/u.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : undefined;
}

// One message per code, like the issue messages; a message never repeats the path, which may come from data.
const messages: Readonly<Record<PathErrorCode, string>> = {
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

function fail(code: PathErrorCode, span: Span): Err<PathError> {
  return err({ code, message: messages[code], span });
}
