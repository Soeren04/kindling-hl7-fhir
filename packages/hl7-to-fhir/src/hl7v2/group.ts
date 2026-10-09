// Matches the segments of a message against the abstract message syntax of its structure in one pass. The matcher
// keeps one frame per open group and never recurses over the input; the structures are small and fixed, so a segment
// costs at most a few walks over its structure, and a message takes time linear in its segments.
import type { Issue } from "../shared/issue";
import { report } from "../shared/collect";
import { emptySpanAt } from "../shared/span";
import type { StructureElement } from "./definitions/types";
import type { Hl7Message, Segment } from "./model";
import { isValidSegmentId } from "./segment";
import { resolveStructure } from "./structure";

/**
 * A segment in a {@link SegmentGroup}: its position in `message.segments`.
 *
 * @example
 * ```ts
 * import type { Hl7Message, SegmentReference } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 * declare const reference: SegmentReference;
 *
 * const segment = message.segments[reference.segmentIndex];
 * ```
 */
export interface SegmentReference {
  /** Discriminant: a segment, not a group. */
  readonly kind: "segment";
  /** The 0-based index of the segment in `message.segments`. */
  readonly segmentIndex: number;
}

/**
 * One occurrence of a segment group of the message structure, such as one `ORDER_OBSERVATION` of an ORU^R01.
 *
 * @example
 * ```ts
 * import type { SegmentGroup } from "hl7-to-fhir/hl7v2";
 *
 * declare const order: SegmentGroup;
 *
 * const observations = order.children.filter(
 *   (child) => child.kind === "group" && child.name === "OBSERVATION",
 * );
 * ```
 */
export interface SegmentGroup {
  /** Discriminant: a group, not a segment. */
  readonly kind: "group";
  /** The name of the group in the message structure, such as `ORDER_OBSERVATION`. */
  readonly name: string;
  /** The segments and nested groups of this occurrence, in message order. */
  readonly children: readonly GroupChild[];
}

/**
 * A segment or a nested group in a {@link SegmentGroup} or at the top level of {@link MessageGroups}.
 *
 * @example
 * ```ts
 * import type { GroupChild } from "hl7-to-fhir/hl7v2";
 *
 * function segmentIndexes(children: readonly GroupChild[]): number[] {
 *   return children.flatMap((child) =>
 *     child.kind === "segment" ? [child.segmentIndex] : segmentIndexes(child.children),
 *   );
 * }
 * ```
 */
export type GroupChild = SegmentReference | SegmentGroup;

/**
 * The segments of a message arranged in the groups of its message structure.
 *
 * Every segment of the message appears exactly once, in message order, so the tree never drops a segment: one the
 * structure does not allow at its position (a Z segment, an unknown or misplaced one) is placed in the group that was
 * open when it occurred and reported in `issues`. When the structure is unknown or the library has no definition of
 * it, every segment is a child of the top level.
 *
 * @example
 * ```ts
 * import type { MessageGroups } from "hl7-to-fhir/hl7v2";
 *
 * declare const groups: MessageGroups;
 *
 * if (groups.structure === "ORU_R01") console.log(groups.children.length);
 * ```
 */
export interface MessageGroups {
  /**
   * The message structure, such as `ORU_R01`: MSH-9.3, or the structure MSH-9.1 and MSH-9.2 imply (`ACK` for an
   * acknowledgment, otherwise the one HL7 table 0354 assigns to the message code and trigger event). Absent when
   * MSH-9 identifies none.
   */
  readonly structure?: string | undefined;
  /** The top-level segments and groups, in message order. */
  readonly children: readonly GroupChild[];
  /** The issues of the structure and of what does not match it, in message order. */
  readonly issues: readonly Issue[];
}

/** The tree that {@link groupSegments} builds, without the issues it reports. */
type GroupTree = Omit<MessageGroups, "issues">;

/** An open occurrence of a group, or of the whole structure: where the matcher is in its elements. */
interface Frame {
  /** The group around this one; absent for the structure itself. */
  readonly parent: Frame | undefined;
  readonly elements: readonly StructureElement[];
  /** The element the last segment matched; 0 before the first. */
  index: number;
  /** How often the element at `index` occurred in this occurrence of the group; 0 before the first segment. */
  count: number;
  /** The indexes of the elements that occurred in this occurrence of the group. */
  readonly seen: Set<number>;
  /**
   * The identifiers of the segments the structure contains that were placed while this occurrence was open, out of
   * order or repeated. Such a segment is present, so it is not reported as missing as well.
   */
  readonly misplaced: Set<string>;
  readonly children: GroupChild[];
}

/** One element on the way from an open group to the segment element a segment occupies. */
interface Step {
  readonly index: number;
  readonly element: StructureElement;
}

/** Where a segment continues the structure: an open group and the elements from it down to the segment element. */
interface Match {
  readonly frame: Frame;
  readonly steps: readonly [Step, ...Step[]];
}

/**
 * Arranges the segments of a message in the groups of its structure (see {@link MessageGroups}).
 *
 * @param message - The message.
 * @param isDefined - Whether the caller has a definition of a segment, which allows it where the structure does not
 *   contain it.
 * @param issues - Receives the issues of the structure resolution, `SEGMENT_MISSING`, `SEGMENT_OUT_OF_ORDER`,
 *   `SEGMENT_REPEATED`, `UNEXPECTED_SEGMENT` and `UNDEFINED_Z_SEGMENT`.
 */
export function groupSegments(
  message: Hl7Message,
  isDefined: (segmentId: string) => boolean,
  issues: Issue[],
): GroupTree {
  const { id: structure, definition } = resolveStructure(message, issues);
  const named = structure === undefined ? {} : { structure };
  if (definition === undefined) {
    const children = message.segments.map((_, index) => reference(index));
    return { ...named, children };
  }
  const matcher: Matcher = {
    allowed: segmentIdsOf(definition.elements),
    isDefined,
    lastIndex: new Map(
      message.segments.map((segment, index) => [segment.id, index]),
    ),
    issues,
  };
  const root = openFrame(undefined, definition.elements);
  let current = root;
  for (const [segmentIndex, segment] of message.segments.entries()) {
    current = place(matcher, current, segment, segmentIndex);
  }
  const end = emptySpanAt(message.segments.at(-1)?.span.end ?? 0);
  for (
    let frame: Frame | undefined = current;
    frame !== undefined;
    frame = frame.parent
  ) {
    for (const segmentId of requiredUntil(frame, frame.elements.length)) {
      report(issues, "SEGMENT_MISSING", { span: end, segmentId });
    }
  }
  return { ...named, children: root.children };
}

/** What the matcher knows about the whole message while it places one segment after the other. */
interface Matcher {
  /** Every segment identifier the structure contains. */
  readonly allowed: ReadonlySet<string>;
  /** Whether the caller has a definition of a segment, which allows it where the structure does not contain it. */
  readonly isDefined: (segmentId: string) => boolean;
  /** The index of the last segment of each identifier, which tells whether a segment occurs later. */
  readonly lastIndex: ReadonlyMap<string, number>;
  readonly issues: Issue[];
}

/**
 * Places one segment: where it continues the structure, or in the innermost open group when it cannot.
 *
 * @returns The innermost open group afterwards.
 */
function place(
  matcher: Matcher,
  current: Frame,
  segment: Segment,
  segmentIndex: number,
): Frame {
  const match = findMatch(current, segment.id);
  const skipped = match === undefined ? [] : skippedBy(current, match);
  // A match that skips a required segment that comes later would report a segment that is present as missing; the
  // segment at hand is the one out of place.
  const skipsLater = skipped.some(
    (id) => (matcher.lastIndex.get(id) ?? -1) > segmentIndex,
  );
  if (match === undefined || skipsLater) {
    current.children.push(reference(segmentIndex));
    reportUnmatched(matcher, current, segment, segmentIndex);
    return current;
  }
  // A segment that is missing belongs right before the segment that shows it is missing.
  const at = emptySpanAt(segment.span.start);
  for (const segmentId of skipped) {
    report(matcher.issues, "SEGMENT_MISSING", { span: at, segmentId });
  }
  return enter(match, segmentIndex);
}

function reference(segmentIndex: number): SegmentReference {
  return { kind: "segment", segmentIndex };
}

function openFrame(
  parent: Frame | undefined,
  elements: readonly StructureElement[],
): Frame {
  return {
    parent,
    elements,
    index: 0,
    count: 0,
    seen: new Set(),
    misplaced: new Set(),
    children: [],
  };
}

/** Whether the element at `index` is the one the last segment of the group matched, so a match there repeats it. */
function continues(frame: Frame, index: number): boolean {
  return index === frame.index && frame.count > 0;
}

/**
 * Finds where a segment continues the structure, preferring the innermost open group: in each group, the element the
 * last segment matched when it repeats, and otherwise the next element an occurrence of which can start with the
 * segment.
 */
function findMatch(current: Frame, segmentId: string): Match | undefined {
  for (
    let frame: Frame | undefined = current;
    frame !== undefined;
    frame = frame.parent
  ) {
    for (const [index, element] of frame.elements.entries()) {
      const repeats = continues(frame, index);
      if (index < frame.index || (repeats && element.max !== "unbounded")) {
        continue;
      }
      const inside = entryPath(element, segmentId);
      if (inside !== undefined) {
        return { frame, steps: [{ index, element }, ...inside] };
      }
    }
  }
  return undefined;
}

/**
 * How an occurrence of `element` starts with the segment: an empty path for a segment element of that identifier, the
 * steps into a group whose elements up to its first required one can start with it, or `undefined` when it cannot.
 */
function entryPath(
  element: StructureElement,
  segmentId: string,
): readonly Step[] | undefined {
  if (element.kind === "segment") {
    return element.id === segmentId ? [] : undefined;
  }
  // The recursion follows the nesting of the fixed structure definitions, a few levels at most, never the input.
  for (const [index, child] of element.elements.entries()) {
    const inside = entryPath(child, segmentId);
    if (inside !== undefined) return [{ index, element: child }, ...inside];
    // The elements after the first required one cannot start an occurrence.
    if (child.min === 1) break;
  }
  return undefined;
}

/**
 * The required segments a match skips: those the groups it closes have not seen, and those between the last element
 * of its group and the element it matches. The groups it opens are entered at an element that no required one
 * precedes, so they skip none.
 */
function skippedBy(current: Frame, { frame: matched, steps }: Match): string[] {
  const skipped: string[] = [];
  for (
    let frame: Frame | undefined = current;
    frame !== matched && frame !== undefined;
    frame = frame.parent
  ) {
    skipped.push(...requiredUntil(frame, frame.elements.length));
  }
  const { index } = steps[0];
  if (!continues(matched, index)) {
    skipped.push(...requiredUntil(matched, index));
  }
  return skipped;
}

/**
 * The first required segment of each required element after the last one the group has seen and before `until`,
 * leaving out segments that are present elsewhere in this occurrence of the group.
 */
function requiredUntil(frame: Frame, until: number): string[] {
  const from = frame.count > 0 ? frame.index + 1 : frame.index;
  const required: string[] = [];
  for (const [index, element] of frame.elements.entries()) {
    if (index < from || index >= until || element.min !== 1) continue;
    const segmentId = requiredSegmentOf([element]);
    if (segmentId !== undefined && !frame.misplaced.has(segmentId)) {
      required.push(segmentId);
    }
  }
  return required;
}

/**
 * Commits a match: counts the occurrence and opens the groups on the way down to the segment element, where the
 * segment is placed. The required elements it skips are reported by the caller.
 *
 * @returns The innermost open group afterwards.
 */
function enter({ frame: matched, steps }: Match, segmentIndex: number): Frame {
  let frame = matched;
  for (const { index, element } of steps) {
    if (continues(frame, index)) {
      frame.count++;
    } else {
      frame.index = index;
      frame.count = 1;
    }
    frame.seen.add(index);
    if (element.kind === "segment") {
      frame.children.push(reference(segmentIndex));
    } else {
      const group = openFrame(frame, element.elements);
      frame.children.push({
        kind: "group",
        name: element.name,
        children: group.children,
      });
      frame = group;
    }
  }
  return frame;
}

/**
 * The first segment that elements cannot do without: the first required element, or the first required segment
 * inside it when it is a group. Every group of the definitions holds a required element, which a test checks.
 */
function requiredSegmentOf(
  elements: readonly StructureElement[],
): string | undefined {
  const required = elements.find((element) => element.min === 1);
  return required?.kind === "group"
    ? requiredSegmentOf(required.elements)
    : required?.id;
}

/** Every segment identifier that occurs anywhere in a structure. */
function segmentIdsOf(
  elements: readonly StructureElement[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  const pending: (readonly StructureElement[])[] = [elements];
  for (let list = pending.pop(); list !== undefined; list = pending.pop()) {
    for (const element of list) {
      if (element.kind === "segment") ids.add(element.id);
      else pending.push(element.elements);
    }
  }
  return ids;
}

/** Reports a segment that cannot continue the structure, unless a caller's definition allows it anywhere. */
function reportUnmatched(
  matcher: Matcher,
  current: Frame,
  segment: Segment,
  segmentIndex: number,
): void {
  const { id, span } = segment;
  const { issues } = matcher;
  if (!isValidSegmentId(id)) {
    report(issues, "UNEXPECTED_SEGMENT", { span, segmentIndex });
    return;
  }
  const location = { span, segmentIndex, segmentId: id };
  if (matcher.allowed.has(id)) {
    report(issues, misplacement(current, id), location);
    for (
      let frame: Frame | undefined = current;
      frame !== undefined;
      frame = frame.parent
    ) {
      frame.misplaced.add(id);
    }
  } else if (!matcher.isDefined(id)) {
    const code = id.startsWith("Z")
      ? "UNDEFINED_Z_SEGMENT"
      : "UNEXPECTED_SEGMENT";
    report(issues, code, location);
  }
}

/**
 * Why a segment the structure contains cannot be placed: it is repeated when an open group has already seen an
 * element that occurs at most once and that the segment would start again, and out of order otherwise.
 */
function misplacement(
  current: Frame,
  segmentId: string,
): "SEGMENT_REPEATED" | "SEGMENT_OUT_OF_ORDER" {
  for (
    let frame: Frame | undefined = current;
    frame !== undefined;
    frame = frame.parent
  ) {
    for (const index of frame.seen) {
      const element = frame.elements[index];
      if (element?.max === 1 && entryPath(element, segmentId) !== undefined) {
        return "SEGMENT_REPEATED";
      }
    }
  }
  return "SEGMENT_OUT_OF_ORDER";
}
