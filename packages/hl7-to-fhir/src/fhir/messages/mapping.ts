// What the message mappers share: the resources they create, each with its fullUrl and the segment it comes from, the
// record of the segments they map, and helpers to walk the segment groups of `group`.
import type { GroupChild, SegmentGroup } from "../../hl7v2/group";
import type { Hl7Message } from "../../hl7v2/model";
import type { MappingContext } from "../context";
import type { MappedResource } from "../options";
import type { SegmentAt } from "../resources/segment";
import type { TextDelimiters } from "../resources/text";

/** A resource of the bundle, its fullUrl and the segment it was mapped from. */
export interface MappedEntry {
  readonly fullUrl: string;
  readonly resource: MappedResource;
  readonly source: SegmentAt;
}

/** What a message mapper works with. */
export interface MessageMapping {
  readonly context: MappingContext;
  readonly message: Hl7Message;
  /** The separators of free text in the message. */
  readonly delimiters: TextDelimiters;
  /** The fullUrl of the next resource of the bundle, which comes from the segment `source`. */
  readonly nextUrl: (source: SegmentAt) => string;
  /** Records that the mapping carries the segment into the bundle, so it is not reported as `SEGMENT_NOT_MAPPED`. */
  readonly markMapped: (segment: SegmentAt) => void;
}

/** The segments with identifier `segmentId` among `children`, without looking into nested groups. */
export function segmentsOf(
  message: Hl7Message,
  children: readonly GroupChild[],
  segmentId: string,
): SegmentAt[] {
  return children.flatMap((child) => {
    if (child.kind !== "segment") return [];
    const segment = message.segments[child.segmentIndex];
    return segment?.id === segmentId
      ? [{ segment, segmentIndex: child.segmentIndex }]
      : [];
  });
}

/** The first segment with identifier `segmentId` among `children` (see {@link segmentsOf}). */
export function segmentOf(
  message: Hl7Message,
  children: readonly GroupChild[],
  segmentId: string,
): SegmentAt | undefined {
  return segmentsOf(message, children, segmentId)[0];
}

/** The occurrences of the group `name` among `children`, without looking into nested groups. */
export function groupsOf(
  children: readonly GroupChild[],
  name: string,
): SegmentGroup[] {
  return children.filter(
    (child): child is SegmentGroup =>
      child.kind === "group" && child.name === name,
  );
}
