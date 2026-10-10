// A segment together with its position in the message, which every value source and issue location needs.
import type { Segment } from "../../hl7v2/model";
import { isValidSegmentId } from "../../hl7v2/segment";
import type { Location } from "../../shared/issue";
import { emptySpanAt } from "../../shared/span";
import { fieldValue, fieldValues, leaf, type Source } from "../source";

/** A segment of the message and its 0-based index in `message.segments`. */
export interface SegmentAt {
  readonly segment: Segment;
  readonly segmentIndex: number;
}

/** The first repetition of field `field` (1-based) of the segment. */
export function field(at: SegmentAt, field: number): Source | undefined {
  return fieldValue(at.segment, at.segmentIndex, field);
}

/** Every repetition of field `field` (1-based) of the segment. */
export function repetitions(at: SegmentAt, field: number): readonly Source[] {
  return fieldValues(at.segment, at.segmentIndex, field);
}

/** The location of the segment as a whole. */
export function segmentLocation({
  segment,
  segmentIndex,
}: SegmentAt): Location {
  return {
    span: segment.span,
    segmentIndex,
    ...(isValidSegmentId(segment.id) ? { segmentId: segment.id } : {}),
  };
}

/**
 * The location of field `field`, also when it is absent: then its span is the empty span at the end of the segment,
 * where the field would be written.
 */
export function fieldLocation(at: SegmentAt, field: number): Location {
  const span =
    at.segment.fields[field - 1]?.span ?? emptySpanAt(at.segment.span.end);
  return { ...segmentLocation(at), span, field };
}

/**
 * Whether a value holds text, without reporting a null: for a condition on a value that a mapper reads (and reports)
 * on its own.
 */
export function isValued(source: Source | undefined): boolean {
  const first = leaf(source);
  return first?.kind === "value" && first.value !== "";
}
