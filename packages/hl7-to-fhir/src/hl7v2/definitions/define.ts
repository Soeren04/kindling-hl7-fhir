import type {
  Cardinality,
  ComponentDefinition,
  CompositeDataType,
  FieldDefinition,
  GroupElement,
  Optionality,
  PrimitiveDataType,
  SegmentElement,
  StructureElement,
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

/** How the standard's message tables write an element: bare is required, `[ ]` optional, `{ }` repeating. */
type Occurrence = "required" | "optional" | "repeating" | "optionalRepeating";

const cardinalities: Readonly<Record<Occurrence, Cardinality>> = {
  required: { min: 1, max: 1 },
  optional: { min: 0, max: 1 },
  repeating: { min: 1, max: "unbounded" },
  optionalRepeating: { min: 0, max: "unbounded" },
};

/**
 * Builds a segment element of a message structure.
 *
 * @param id - The segment identifier.
 * @param occurrence - How often the segment occurs.
 * @returns The element.
 * @example
 * ```ts
 * const nk1 = segment("NK1", "optionalRepeating"); // [{ NK1 }]
 * ```
 */
export function segment(id: string, occurrence: Occurrence): SegmentElement {
  return { kind: "segment", id, ...cardinalities[occurrence] };
}

/**
 * Builds a group element of a message structure.
 *
 * @param name - The group name.
 * @param occurrence - How often the group occurs.
 * @param elements - The group's segments and nested groups; at least one of them must be required.
 * @returns The element.
 * @example
 * ```ts
 * const procedure = group("PROCEDURE", "optionalRepeating", [
 *   segment("PR1", "required"),
 *   segment("ROL", "optionalRepeating"),
 * ]);
 * ```
 */
export function group(
  name: string,
  occurrence: Occurrence,
  elements: readonly StructureElement[],
): GroupElement {
  return { kind: "group", name, ...cardinalities[occurrence], elements };
}
