// Walks the values of a segment together with the data type and the table that apply to each, so that the format and
// table rules see every value with its type, and finds the components and subcomponents a data type does not define.
// The walk yields everything in message order, so that each rule finds its issues in message order.
import type { Span } from "../../shared/issue";
import { dataTypes } from "../definitions/data-types";
import type {
  ComponentDefinition,
  FieldDefinition,
} from "../definitions/types";
import type {
  Component,
  Repetition,
  Segment,
  Subcomponent,
  ValueSubcomponent,
} from "../model";
import {
  observationValueField,
  obx,
  valueTypeField,
} from "../definitions/segments/obx";
import { isPopulated } from "./populated";
import type { Position, SegmentContext } from "./rule";
import { valueFormats } from "./value-formats";

/** A value with the data type and the table that apply to it. */
interface TypedValue {
  readonly kind: "value";
  readonly subcomponent: ValueSubcomponent;
  /** The identifier of the primitive data type, such as `DTM` for TS.1. */
  readonly dataType: string;
  /** The number of the table the value must come from, if any. */
  readonly table: string | undefined;
  readonly position: Position;
}

/** A component or subcomponent with content that its data type does not define. */
interface UnexpectedPart {
  readonly kind: "unexpected";
  readonly span: Span;
  readonly position: Position;
}

type Part = TypedValue | UnexpectedPart;

/**
 * Every value of a segment with its data type and table, and every component or subcomponent with content that its
 * data type does not define. A field of an unknown data type, or whose type varies without a known type, yields
 * nothing, as nothing is known about its structure. Values that are empty, null or truncated by the sender are not
 * yielded: there is no complete text to check.
 */
export function* walkValues(context: SegmentContext): Generator<Part> {
  for (const field of context.definition.fields) {
    const dataType = fieldType(context.segment, field);
    const node = context.segment.fields[field.position - 1];
    if (dataType === undefined || node === undefined) continue;
    for (const [index, repetition] of node.repetitions.entries()) {
      const position = { field: field.position, repetition: index + 1 };
      yield* walkRepetition(repetition, dataType, field.table, position);
    }
  }
}

/**
 * The data type of a field: its definition's, or for OBX-5, the only field of the shipped segments whose type varies,
 * the one OBX-2 names in the same segment.
 */
function fieldType(
  segment: Segment,
  field: FieldDefinition,
): string | undefined {
  if (field.dataType !== "varies") return field.dataType;
  const isObservationValue =
    segment.id === obx.id && field.position === observationValueField;
  const named =
    segment.fields[valueTypeField - 1]?.repetitions[0]?.components[0]
      ?.subcomponents[0];
  return isObservationValue && named?.kind === "value"
    ? named.value
    : undefined;
}

/** What the walk knows about a data type: its components, `[]` for a primitive type, `undefined` when unknown. */
function componentsOf(
  dataType: string,
): readonly ComponentDefinition[] | undefined {
  const definition = dataTypes.get(dataType);
  if (definition?.kind === "composite") return definition.components;
  return definition?.kind === "primitive" || valueFormats.has(dataType)
    ? []
    : undefined;
}

/**
 * The primitive type of a subcomponent of type `dataType`. A subcomponent cannot be split further, so of a composite
 * type only the first component can be written there: TS.1, a DTM, for a TS.
 */
function primitiveOf(dataType: string): string {
  const definition = dataTypes.get(dataType);
  const first =
    definition?.kind === "composite" ? definition.components[0] : undefined;
  // The recursion follows the nesting of the fixed data type definitions (DR, TS, DTM), never the input.
  return first === undefined ? dataType : primitiveOf(first.dataType);
}

/**
 * The table of the first component or subcomponent: the table of the enclosing field or component when it has one,
 * because a coded composite such as CE carries the table of its field in its first component, the code.
 */
function tableOf(
  index: number,
  enclosing: string | undefined,
  definition: ComponentDefinition,
): string | undefined {
  return index === 0 ? (enclosing ?? definition.table) : definition.table;
}

function* walkRepetition(
  repetition: Repetition,
  dataType: string,
  table: string | undefined,
  position: Position,
): Generator<Part> {
  const definitions = componentsOf(dataType);
  if (definitions === undefined) return;
  const { components } = repetition;
  if (definitions.length === 0) {
    // A primitive field is a single component.
    const first = components[0];
    const at = { ...position, component: 1 };
    if (first !== undefined) yield* walkComponent(first, dataType, table, at);
  }
  for (const [index, definition] of definitions.entries()) {
    const component = components[index];
    if (component === undefined) break;
    const at = { ...position, component: index + 1 };
    const applies = tableOf(index, table, definition);
    yield* walkComponent(component, definition.dataType, applies, at);
  }
  // The components a type does not define come after those it does, so the walk stays in message order.
  yield* unexpectedParts(components, definitions.length, position, "component");
}

function* walkComponent(
  component: Component,
  dataType: string,
  table: string | undefined,
  position: Position,
): Generator<Part> {
  // The caller knows the type of a primitive field, and every component type of the shipped composite types is
  // defined (a test of the data types checks it), so the type is known.
  const definitions = componentsOf(dataType) ?? [];
  const { subcomponents } = component;
  if (definitions.length === 0) {
    // A primitive component is a single subcomponent.
    const at = { ...position, subcomponent: 1 };
    yield* valueOf(subcomponents[0], dataType, table, at);
  }
  for (const [index, definition] of definitions.entries()) {
    const at = { ...position, subcomponent: index + 1 };
    const applies = tableOf(index, table, definition);
    const type = primitiveOf(definition.dataType);
    yield* valueOf(subcomponents[index], type, applies, at);
  }
  yield* unexpectedParts(
    subcomponents,
    definitions.length,
    position,
    "subcomponent",
  );
}

function* valueOf(
  subcomponent: Subcomponent | undefined,
  dataType: string,
  table: string | undefined,
  position: Position,
): Generator<TypedValue> {
  if (
    subcomponent?.kind === "value" &&
    subcomponent.value !== "" &&
    subcomponent.truncated !== true
  ) {
    yield { kind: "value", subcomponent, dataType, table, position };
  }
}

/**
 * The nodes of one level that hold something but have no definition: those after the `defined` ones, or every one
 * after the first when the level belongs to a primitive type (`defined` is 0).
 */
function* unexpectedParts(
  nodes: readonly (Component | Subcomponent)[],
  defined: number,
  position: Position,
  level: "component" | "subcomponent",
): Generator<UnexpectedPart> {
  const first = Math.max(defined, 1);
  for (const [index, node] of nodes.entries()) {
    if (index >= first && isPopulated(node)) {
      const at = { ...position, [level]: index + 1 };
      yield { kind: "unexpected", span: node.span, position: at };
    }
  }
}
