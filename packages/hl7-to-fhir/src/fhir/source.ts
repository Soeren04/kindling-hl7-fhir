// Read access to the HL7 values a mapper turns into FHIR. A data type can sit at three levels of the tree: a field
// repetition (PID-5 is an XPN made of components), a component (CX.4 is an HD made of subcomponents) or a subcomponent
// (DR.1 inside XPN.10 is a TS that only has room for TS.1). A `Source` hides the level, so one mapper serves every
// position of its type, and carries the location every issue about the value needs.
import { isValidSegmentId } from "../hl7v2/segment";
import type {
  Component,
  Repetition,
  Segment,
  Subcomponent,
} from "../hl7v2/model";
import type { Location } from "../shared/issue";
import { compact } from "./compact";

/** A value of some data type in the message: a node of the tree and where it is. */
export interface Source {
  /** The repetition, component or subcomponent that holds the value. */
  readonly node: Repetition | Component | Subcomponent;
  /** The location of the node, used for every issue about the value. */
  readonly location: Location;
}

/**
 * The repetitions of field `field` of a segment, each as the source of one value; `[]` when the field is empty or
 * absent.
 *
 * @param segmentIndex - The 0-based position of the segment in the message.
 * @param field - The 1-based field number, as in `PID-5`.
 */
export function fieldValues(
  segment: Segment,
  segmentIndex: number,
  field: number,
): readonly Source[] {
  const repetitions = segment.fields[field - 1]?.repetitions ?? [];
  // Locations never carry content, so an invalid identifier, possible for user-mapped segments, is left out.
  const segmentId = isValidSegmentId(segment.id) ? segment.id : undefined;
  return repetitions.map((node, index) => ({
    node,
    location: compact({
      span: node.span,
      segmentIndex,
      segmentId,
      field,
      repetition: index + 1,
    }),
  }));
}

/** The first repetition of field `field` of a segment (see {@link fieldValues}), or `undefined` when there is none. */
export function fieldValue(
  segment: Segment,
  segmentIndex: number,
  field: number,
): Source | undefined {
  return fieldValues(segment, segmentIndex, field)[0];
}

/**
 * Part `n` (1-based) of a value: component `n` of a repetition, subcomponent `n` of a component. A subcomponent cannot
 * be split further, so it is its own first part and has no others: a composite type written into a subcomponent holds
 * only its first component, as TS.1 in DR.1.
 */
export function part(
  source: Source | undefined,
  n: number,
): Source | undefined {
  if (source === undefined) return undefined;
  const { node, location } = source;
  if ("components" in node) {
    const component = node.components[n - 1];
    return component === undefined
      ? undefined
      : {
          node: component,
          location: { ...location, span: component.span, component: n },
        };
  }
  if ("subcomponents" in node) {
    const subcomponent = node.subcomponents[n - 1];
    return subcomponent === undefined
      ? undefined
      : {
          node: subcomponent,
          location: { ...location, span: subcomponent.span, subcomponent: n },
        };
  }
  return n === 1 ? source : undefined;
}

/**
 * The first subcomponent of a value, which holds the text of a primitive value wherever it sits: a primitive field is
 * one component of one subcomponent.
 */
export function leaf(source: Source | undefined): Subcomponent | undefined {
  if (source === undefined) return undefined;
  const { node } = source;
  if ("components" in node) return node.components[0]?.subcomponents[0];
  if ("subcomponents" in node) return node.subcomponents[0];
  return node;
}

/**
 * Whether a value is the explicit null `""` and nothing else, the way `isNull` of `hl7-to-fhir/hl7v2` reads a
 * position: `""^Adam` is not null, although its first component is.
 */
export function isNullValue(source: Source): boolean {
  const { node } = source;
  if ("components" in node) {
    return (
      node.components.length === 1 &&
      node.components[0]?.subcomponents.length === 1 &&
      node.components[0].subcomponents[0]?.kind === "null"
    );
  }
  if ("subcomponents" in node) {
    return (
      node.subcomponents.length === 1 && node.subcomponents[0]?.kind === "null"
    );
  }
  return node.kind === "null";
}
