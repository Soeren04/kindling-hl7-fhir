// Checks segment definitions at runtime. `defineSegment` throws on what this module finds, because a malformed
// definition is a mistake in the caller's code (ADR 0004); `validate` and `group` report it as an issue instead,
// because they never throw.
import { err, ok, type Result } from "../shared/result";
import type { Optionality, SegmentDefinition } from "./definitions/types";
import { isValidSegmentId } from "./segment";
import { isKnownDataType } from "./validate/values";

/** What is wrong with a definition: a value of the wrong type, or of the right type outside what is allowed. */
export interface DefinitionProblem {
  /** `type` for a missing value or one of the wrong type, `range` for a value that is not allowed. */
  readonly kind: "type" | "range";
  /** What is wrong, naming the property, such as `fields[2].maxRepetitions must be ...`. */
  readonly message: string;
}

/** An object whose properties are still unchecked. */
type Unchecked = Readonly<Record<string, unknown>>;

const optionalities: ReadonlySet<string> = new Set<Optionality>([
  "R",
  "O",
  "C",
  "B",
  "X",
]);

/**
 * What is wrong with the input of `defineSegment`: an identifier and fields whose optionality and repetitions may be
 * left out.
 *
 * @returns The first problem, or `undefined` when the input is valid.
 */
export function segmentInputProblem(
  input: unknown,
): DefinitionProblem | undefined {
  return segmentProblem(input, fieldInputProblem);
}

/**
 * Checks a segment definition as `defineSegment` returns it: fields numbered from 1 in order, each with its
 * optionality and repetitions.
 *
 * @returns The definition, or the first problem with it.
 */
export function checkSegmentDefinition(
  definition: unknown,
): Result<SegmentDefinition, DefinitionProblem> {
  const problem = segmentProblem(definition, fieldDefinitionProblem);
  // The checks above cover every property that `SegmentDefinition` declares.
  return problem === undefined
    ? ok(definition as SegmentDefinition)
    : err(problem);
}

function segmentProblem(
  segment: unknown,
  fieldProblem: (
    field: Unchecked,
    path: string,
    position: number,
  ) => DefinitionProblem | undefined,
): DefinitionProblem | undefined {
  if (!isObject(segment)) return typeProblem("the definition", "an object");
  const { id, fields } = segment;
  if (typeof id !== "string") return typeProblem("id", "a string");
  if (!isValidSegmentId(id)) {
    return rangeProblem(
      `id ${JSON.stringify(id)} must be three upper-case letters or digits, starting with a letter`,
    );
  }
  if (!Array.isArray(fields)) return typeProblem("fields", "an array");
  // A plain loop visits holes, which `find` and `some` would skip.
  for (let index = 0; index < fields.length; index++) {
    const path = `fields[${String(index)}]`;
    const field: unknown = fields[index];
    const problem = isObject(field)
      ? fieldProblem(field, path, index + 1)
      : typeProblem(path, "an object");
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** A field as `defineSegment` returns it: its position, optionality and repetitions are required. */
function fieldDefinitionProblem(
  field: Unchecked,
  path: string,
  position: number,
): DefinitionProblem | undefined {
  const { position: declared, optionality, maxRepetitions } = field;
  if (declared !== position) {
    return rangeProblem(
      `${path}.position must be ${String(position)}: fields are numbered from 1 in order`,
    );
  }
  if (optionality === undefined)
    return typeProblem(`${path}.optionality`, "a string");
  if (maxRepetitions === undefined) {
    return typeProblem(`${path}.maxRepetitions`, 'a number or "unbounded"');
  }
  return fieldInputProblem(field, path);
}

/** A field as `defineSegment` takes it: its optionality, repetitions and table may be left out. */
function fieldInputProblem(
  field: Unchecked,
  path: string,
): DefinitionProblem | undefined {
  const { name, dataType, optionality, maxRepetitions, table } = field;
  if (typeof name !== "string") return typeProblem(`${path}.name`, "a string");
  if (name === "") return rangeProblem(`${path}.name must not be empty`);
  if (typeof dataType !== "string") {
    return typeProblem(`${path}.dataType`, "a string");
  }
  if (!isKnownDataType(dataType)) {
    return rangeProblem(
      `${path}.dataType ${JSON.stringify(dataType)} is not a data type the library knows; use ST for text the library should not check`,
    );
  }
  if (optionality !== undefined) {
    if (typeof optionality !== "string") {
      return typeProblem(`${path}.optionality`, "a string");
    }
    if (!optionalities.has(optionality)) {
      return rangeProblem(
        `${path}.optionality ${JSON.stringify(optionality)} must be one of R, O, C, B and X`,
      );
    }
  }
  if (maxRepetitions !== undefined && maxRepetitions !== "unbounded") {
    if (typeof maxRepetitions !== "number") {
      return typeProblem(`${path}.maxRepetitions`, 'a number or "unbounded"');
    }
    if (!Number.isSafeInteger(maxRepetitions) || maxRepetitions < 1) {
      return rangeProblem(
        `${path}.maxRepetitions ${String(maxRepetitions)} must be a whole number of at least 1 or "unbounded"`,
      );
    }
  }
  if (table !== undefined) {
    if (typeof table !== "string")
      return typeProblem(`${path}.table`, "a string");
    if (!/^\d{4}$/u.test(table)) {
      return rangeProblem(
        `${path}.table ${JSON.stringify(table)} must be a table number of four digits, such as 0001`,
      );
    }
  }
  return undefined;
}

function isObject(value: unknown): value is Unchecked {
  return typeof value === "object" && value !== null;
}

function typeProblem(path: string, expected: string): DefinitionProblem {
  return { kind: "type", message: `${path} must be ${expected}` };
}

function rangeProblem(message: string): DefinitionProblem {
  return { kind: "range", message };
}
