import { segmentInputProblem } from "./definition-check";
import type {
  FieldDefinition,
  Optionality,
  SegmentDefinition,
} from "./definitions/types";

/**
 * One field of a {@link SegmentDefinitionInput}. Its number is its position in the list: the first field is field 1.
 *
 * @example
 * ```ts
 * import type { FieldDefinitionInput } from "hl7-to-fhir/hl7v2";
 *
 * const visitCount: FieldDefinitionInput = { name: "visitCount", dataType: "NM", optionality: "R" };
 * ```
 */
export interface FieldDefinitionInput {
  /** A short identifier-style name, such as `favouriteColour`. */
  readonly name: string;
  /**
   * The data type, such as `ST`, `NM`, `DTM`, `TS`, `CE` or `XPN`: one of the types of the library's segment
   * definitions or `TM`. The formats of `NM`, `SI`, `DT`, `DTM`, `TM`, `ID` and `IS` are checked, and the components
   * of composite types. For a type the library does not know, use `ST`, which is not checked.
   */
  readonly dataType: string;
  /** Whether the field is required (`R`); `O`, optional, when left out. */
  readonly optionality?: Optionality | undefined;
  /** How often the field may repeat: a whole number of at least 1 or `"unbounded"`; 1 when left out. */
  readonly maxRepetitions?: number | "unbounded" | undefined;
  /**
   * The number of the HL7 table its codes come from: four digits, such as `0001`. Only the tables the library ships
   * are checked: 0001, 0003, 0004, 0076, 0085, 0104, 0123, 0203 and 0354.
   */
  readonly table?: string | undefined;
}

/**
 * What {@link defineSegment} takes: a segment identifier and its fields in order.
 *
 * @example
 * ```ts
 * import type { SegmentDefinitionInput } from "hl7-to-fhir/hl7v2";
 *
 * const zpi: SegmentDefinitionInput = { id: "ZPI", fields: [{ name: "setId", dataType: "SI" }] };
 * ```
 */
export interface SegmentDefinitionInput {
  /** The segment identifier, such as `ZPI`: three upper-case letters or digits, starting with a letter. */
  readonly id: string;
  /** The fields in order: the first is field 1. */
  readonly fields: readonly FieldDefinitionInput[];
}

/**
 * Defines a segment, typically a locally defined Z segment, so that `validate` checks it: pass the result in
 * `validate(message, { segments: [...] })`.
 *
 * Fields are numbered by their position in the list and default to optional and not repeating. A segment with a
 * definition is allowed anywhere in a message whose structure does not contain it, so a defined Z segment is never
 * reported for its position. A definition with the identifier of a built-in segment replaces the built-in one. The
 * definitions passed in apply to every message version, while the built-in ones apply to version 2.5 and 2.5.x only.
 *
 * A malformed definition is a mistake in the calling code, not in a message, so it throws instead of returning a
 * `Result`, as the library does only for programming errors: a `TypeError` for a missing property or one of the wrong type, and a `RangeError` for an
 * identifier that is not three upper-case letters or digits starting with a letter, an empty name, a data type the
 * library does not know, an optionality other than `R`, `O`, `C`, `B` and `X`, repetitions that are not a whole
 * number of at least 1 or `"unbounded"`, or a table number that is not four digits. The message names the property.
 *
 * @param definition - The identifier and the fields.
 * @returns The definition with every field numbered and its defaults filled in.
 * @throws `TypeError` or `RangeError` when the definition is malformed.
 *
 * @example
 * ```ts
 * import { defineSegment, parse, validate } from "hl7-to-fhir/hl7v2";
 *
 * const zpi = defineSegment({
 *   id: "ZPI",
 *   fields: [
 *     { name: "setId", dataType: "SI" },
 *     { name: "favouriteColour", dataType: "ST", optionality: "R" },
 *     { name: "lastVisit", dataType: "DT" },
 *   ],
 * });
 * zpi.fields[2]; // => { position: 3, name: "lastVisit", dataType: "DT", optionality: "O", maxRepetitions: 1 }
 *
 * const result = parse(
 *   "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.5.1\rEVN||20240115\rPID|1||1||Everyman\rPV1|1|I\rZPI|1||2024-01-15",
 * );
 * if (result.ok) {
 *   validate(result.value.message, { segments: [zpi] }).map(({ code }) => code);
 *   // => ["REQUIRED_FIELD_MISSING", "INVALID_DATE"]
 * }
 * ```
 */
export function defineSegment(
  definition: SegmentDefinitionInput,
): SegmentDefinition {
  const problem = segmentInputProblem(definition);
  if (problem !== undefined) {
    const message = `defineSegment: ${problem.message}`;
    throw problem.kind === "type"
      ? new TypeError(message)
      : new RangeError(message);
  }
  return {
    id: definition.id,
    fields: definition.fields.map((field, index): FieldDefinition => ({
      position: index + 1,
      name: field.name,
      dataType: field.dataType,
      optionality: field.optionality ?? "O",
      maxRepetitions: field.maxRepetitions ?? 1,
      ...(field.table === undefined ? {} : { table: field.table }),
    })),
  };
}
