import type {
  ComponentDefinition,
  CompositeDataType,
  FieldDefinition,
  Optionality,
  PrimitiveDataType,
} from "./types";

/** The optional traits of a field. */
export interface FieldTraits {
  /** `true` when the field repeats without limit, a number when the standard sets a maximum. */
  readonly repeats?: true | number;
  /** The number of the HL7 table that lists the field's codes. */
  readonly table?: string;
}

/**
 * Builds a field definition so that the segment tables stay one line per field.
 *
 * @param position - The 1-based field number.
 * @param name - The short identifier-style name.
 * @param dataType - The data type identifier.
 * @param optionality - Whether the field is required; optional when omitted.
 * @param traits - Repetition and table, when they apply.
 * @returns The field definition.
 * @example
 * ```ts
 * const pid3 = field(3, "patientIdentifierList", "CX", "R", { repeats: true });
 * ```
 */
export function field(
  position: number,
  name: string,
  dataType: string,
  optionality: Optionality = "O",
  traits: FieldTraits = {},
): FieldDefinition {
  const { repeats, table } = traits;
  return {
    position,
    name,
    dataType,
    optionality,
    maxRepetitions:
      repeats === undefined ? 1 : repeats === true ? "unbounded" : repeats,
    ...(table === undefined ? {} : { table }),
  };
}

/**
 * Builds a component definition.
 *
 * @param position - The 1-based component number.
 * @param name - The short identifier-style name.
 * @param dataType - The data type identifier.
 * @param table - The number of the HL7 table that lists the component's codes, if any.
 * @returns The component definition.
 * @example
 * ```ts
 * const familyName = component(1, "familyName", "FN");
 * ```
 */
export function component(
  position: number,
  name: string,
  dataType: string,
  table?: string,
): ComponentDefinition {
  return {
    position,
    name,
    dataType,
    ...(table === undefined ? {} : { table }),
  };
}

/**
 * Builds a primitive data type definition.
 *
 * @param id - The data type identifier.
 * @returns The definition.
 * @example
 * ```ts
 * const st = primitive("ST");
 * ```
 */
export function primitive(id: string): PrimitiveDataType {
  return { kind: "primitive", id };
}

/**
 * Builds a composite data type definition.
 *
 * @param id - The data type identifier.
 * @param components - The components in order.
 * @returns The definition.
 * @example
 * ```ts
 * const hd = composite("HD", [component(1, "namespaceId", "IS")]);
 * ```
 */
export function composite(
  id: string,
  components: readonly ComponentDefinition[],
): CompositeDataType {
  return { kind: "composite", id, components };
}
