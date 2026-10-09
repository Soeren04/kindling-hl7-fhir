// The shape every validation rule shares: what it checks, in words for the generated documentation, the codes it
// reports, and, for the rules that check one segment at a time, the check itself.
import type { Issue, IssueCode, Location, Span } from "../../shared/issue";
import type { SegmentDefinition } from "../definitions/types";
import type { Segment } from "../model";

/** What a validation rule checks, for the table of rules in the documentation. */
export interface RuleDescription {
  /** A short kebab-case name, such as `required-fields`. */
  readonly name: string;
  /** What the rule checks, in one or two sentences without message content. */
  readonly summary: string;
  /** The codes the rule reports. */
  readonly codes: readonly IssueCode[];
  /**
   * Which messages the rule applies to: every message; only those of version 2.5 and 2.5.x; or the segments of those
   * messages that the library defines and, in every message, the segments with a definition passed in.
   */
  readonly scope:
    "every message" | "version 2.5" | "version 2.5 and caller definitions";
}

/** A segment with its position in the message and the definition it is checked against. */
export interface SegmentContext {
  readonly segment: Segment;
  readonly segmentIndex: number;
  readonly definition: SegmentDefinition;
}

/** A rule that checks the fields of one segment against its definition. */
export interface SegmentRule extends RuleDescription {
  /** Checks one segment and adds what it finds to `issues`. */
  readonly check: (context: SegmentContext, issues: Issue[]) => void;
}

/** The position of a node below its segment, in HL7 numbering. */
export type Position = Pick<
  Location,
  "field" | "repetition" | "component" | "subcomponent"
>;

/** The location of a node of the segment in `context`. */
export function locate(
  { segment, segmentIndex }: SegmentContext,
  span: Span,
  position: Position,
): Location {
  // A segment is checked against the definition of its identifier, and definitions have valid identifiers.
  return { span, segmentIndex, segmentId: segment.id, ...position };
}
