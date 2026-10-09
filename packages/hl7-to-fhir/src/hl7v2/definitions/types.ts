// The shapes of the HL7 v2 metadata the library ships: segments, data types, message structures and code tables. The
// data itself lives in sibling files, each citing its source (ADR 0005). Everything is plain readonly data, so the
// validation rules and the typed path union can be generated from it.

/**
 * Whether a sender must populate an element.
 *
 * - `R`: required.
 * - `O`: optional.
 * - `C`: conditional; the condition depends on other elements and is not modelled here.
 * - `B`: kept only for backward compatibility with older versions.
 * - `X`: not used in this version (a reserved position that keeps the numbering contiguous).
 *
 * @example
 * ```ts
 * const optionality: Optionality = "R";
 * ```
 */
export type Optionality = "R" | "O" | "C" | "B" | "X";

/**
 * How often an element may repeat: a count, or `"unbounded"` when the standard sets no limit.
 *
 * @example
 * ```ts
 * const phoneNumbers: MaxRepetitions = 2;
 * const names: MaxRepetitions = "unbounded";
 * ```
 */
export type MaxRepetitions = number | "unbounded";

/**
 * One field of a segment.
 *
 * @example
 * ```ts
 * // PID-3, the patient identifier list
 * const pid3: FieldDefinition = {
 *   position: 3,
 *   name: "patientIdentifierList",
 *   dataType: "CX",
 *   optionality: "R",
 *   maxRepetitions: "unbounded",
 * };
 * ```
 */
export interface FieldDefinition {
  /** The 1-based field number, as in HL7 notation (`PID-3` has position 3). */
  readonly position: number;
  /** A short identifier-style name, unique within the segment (for example `patientName`). */
  readonly name: string;
  /** The identifier of the field's data type, a key of the data type definitions (for example `XPN`). */
  readonly dataType: string;
  /** Whether the field is required. */
  readonly optionality: Optionality;
  /** How often the field may repeat. */
  readonly maxRepetitions: MaxRepetitions;
  /** The number of the HL7 table that lists the field's codes (for example `0001`), when there is one. */
  readonly table?: string;
}

/**
 * A segment: its identifier and its fields in order.
 *
 * @example
 * ```ts
 * const evn: SegmentDefinition = { id: "EVN", fields: [] };
 * ```
 */
export interface SegmentDefinition {
  /** The three-character segment identifier, such as `PID`. */
  readonly id: string;
  /** The fields, ordered by position and numbered contiguously from 1. */
  readonly fields: readonly FieldDefinition[];
}

/**
 * One component of a composite data type. Components of a component are called subcomponents; the same shape
 * describes both.
 *
 * @example
 * ```ts
 * // XPN.1, the family name
 * const familyName: ComponentDefinition = { position: 1, name: "familyName", dataType: "FN" };
 * ```
 */
export interface ComponentDefinition {
  /** The 1-based component number (`XPN.1` has position 1). */
  readonly position: number;
  /** A short identifier-style name, unique within the data type. */
  readonly name: string;
  /** The identifier of the component's data type, a key of the data type definitions. */
  readonly dataType: string;
  /** The number of the HL7 table that lists the component's codes, when there is one. */
  readonly table?: string;
}

/**
 * A data type that is a single value, such as `ST` or `NM`.
 *
 * @example
 * ```ts
 * const st: PrimitiveDataType = { kind: "primitive", id: "ST" };
 * ```
 */
export interface PrimitiveDataType {
  /** Discriminant: the type has no components. */
  readonly kind: "primitive";
  /** The data type identifier. */
  readonly id: string;
}

/**
 * A data type made of components, such as `XPN` or `CX`.
 *
 * @example
 * ```ts
 * const pt: CompositeDataType = {
 *   kind: "composite",
 *   id: "PT",
 *   components: [{ position: 1, name: "processingId", dataType: "ID", table: "0103" }],
 * };
 * ```
 */
export interface CompositeDataType {
  /** Discriminant: the type has components. */
  readonly kind: "composite";
  /** The data type identifier. */
  readonly id: string;
  /** The components, ordered by position and numbered contiguously from 1. */
  readonly components: readonly ComponentDefinition[];
}

/**
 * The placeholder type of a field whose data type depends on another field, such as OBX-5, which follows OBX-2.
 *
 * @example
 * ```ts
 * const varies: VariesDataType = { kind: "varies", id: "varies" };
 * ```
 */
export interface VariesDataType {
  /** Discriminant: the concrete type is decided by another field. */
  readonly kind: "varies";
  /** The data type identifier, `varies`. */
  readonly id: string;
}

/**
 * Any data type definition.
 *
 * @example
 * ```ts
 * function componentCount(type: DataTypeDefinition): number {
 *   return type.kind === "composite" ? type.components.length : 0;
 * }
 * ```
 */
export type DataTypeDefinition =
  PrimitiveDataType | CompositeDataType | VariesDataType;

/**
 * How often a segment or group may occur in a message structure: `min` is 0 for optional and 1 for required.
 *
 * @example
 * ```ts
 * const optionalAndRepeating: Cardinality = { min: 0, max: "unbounded" };
 * ```
 */
export interface Cardinality {
  /** The fewest occurrences: 0 when optional, 1 when required. */
  readonly min: 0 | 1;
  /** The most occurrences: 1, or `"unbounded"` when repeatable. */
  readonly max: 1 | "unbounded";
}

/**
 * A segment in a message structure.
 *
 * @example
 * ```ts
 * const pid: SegmentElement = { kind: "segment", id: "PID", min: 1, max: 1 };
 * ```
 */
export interface SegmentElement extends Cardinality {
  /** Discriminant: a single segment. */
  readonly kind: "segment";
  /** The segment identifier. */
  readonly id: string;
}

/**
 * A group of segments that occur together in a message structure, such as `PROCEDURE` in ADT_A01.
 *
 * The first element of a group is a required segment, which is how a parser recognises that a new occurrence of
 * the group starts.
 *
 * @example
 * ```ts
 * const procedure: GroupElement = {
 *   kind: "group",
 *   name: "PROCEDURE",
 *   min: 0,
 *   max: "unbounded",
 *   elements: [{ kind: "segment", id: "PR1", min: 1, max: 1 }],
 * };
 * ```
 */
export interface GroupElement extends Cardinality {
  /** Discriminant: a group of elements. */
  readonly kind: "group";
  /** The group name, unique among its siblings (for example `PROCEDURE`). */
  readonly name: string;
  /** The segments and nested groups, in message order. */
  readonly elements: readonly StructureElement[];
}

/**
 * A segment or a group in a message structure.
 *
 * @example
 * ```ts
 * function isGroup(element: StructureElement): element is GroupElement {
 *   return element.kind === "group";
 * }
 * ```
 */
export type StructureElement = SegmentElement | GroupElement;

/**
 * The abstract message syntax of one message structure, such as `ADT_A01`.
 *
 * @example
 * ```ts
 * const ack: MessageStructureDefinition = {
 *   id: "ACK",
 *   elements: [{ kind: "segment", id: "MSH", min: 1, max: 1 }],
 * };
 * ```
 */
export interface MessageStructureDefinition {
  /** The structure identifier, as listed in HL7 table 0354 (for example `ORU_R01`). */
  readonly id: string;
  /** The top-level segments and groups in message order. */
  readonly elements: readonly StructureElement[];
}

/**
 * Whether HL7 itself or the implementing site decides which codes a table holds. A message with a code that an
 * HL7-defined table does not list is wrong; a site may add codes to a user-defined table.
 *
 * @example
 * ```ts
 * const kind: CodeTableKind = "hl7-defined";
 * ```
 */
export type CodeTableKind = "hl7-defined" | "user-defined";

/**
 * An HL7 table: its number, name and codes.
 *
 * @example
 * ```ts
 * const sex: CodeTable = {
 *   number: "0001",
 *   name: "Administrative Sex",
 *   kind: "user-defined",
 *   codes: new Set(["F", "M"]),
 * };
 * ```
 */
export interface CodeTable {
  /** The four-digit table number, such as `0001`. */
  readonly number: string;
  /** The table name. */
  readonly name: string;
  /** Who decides which codes the table holds. */
  readonly kind: CodeTableKind;
  /** The codes. */
  readonly codes: ReadonlySet<string>;
}
