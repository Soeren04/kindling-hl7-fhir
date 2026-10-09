import type { Issue } from "../shared/issue";
import { finishIssues, inMessageOrder, maxIssues } from "../shared/collect";
import { type DefinitionOptions, definitionsOf } from "./definition-options";
import { segmentDefinitions } from "./definitions/segment-definitions";
import type { SegmentDefinition } from "./definitions/types";
import { groupSegments } from "./group";
import type { Hl7Message } from "./model";
import { segmentRules } from "./validate/rules/segment-rules";
import { checkVersion } from "./validate/rules/version";

/**
 * Checks a message against the HL7 v2.5.1 definitions of its structure and segments.
 *
 * @param message - A message from `parse`.
 * @param options - Definitions of further segments.
 * @returns Every finding in message order; empty when the message is valid. Never throws.
 */
export function validate(
  message: Hl7Message,
  options: DefinitionOptions = {},
): readonly Issue[] {
  const issues: Issue[] = [];
  const callers = definitionsOf(options, issues);
  const builtIn = checkVersion(message, issues);
  groupSegments(message, (id) => callers.has(id), issues);
  const fieldIssues = checkSegments(
    message,
    (id) =>
      callers.get(id) ?? (builtIn ? segmentDefinitions.get(id) : undefined),
  );
  return finishIssues(
    issues.concat(fieldIssues),
    message.segments.at(-1)?.span.end ?? 0,
  );
}

/**
 * Applies the segment rules to every segment that has a definition.
 *
 * @param definitionOf - The definition a segment of an identifier is checked against, if any.
 * @returns The first issues in message order, at most one more than `maxIssues`, which tells that issues were left.
 */
function checkSegments(
  message: Hl7Message,
  definitionOf: (segmentId: string) => SegmentDefinition | undefined,
): Issue[] {
  const found: Issue[] = [];
  for (const [segmentIndex, segment] of message.segments.entries()) {
    const room = maxIssues + 1 - found.length;
    if (room <= 0) break;
    const definition = definitionOf(segment.id);
    if (definition === undefined) continue;
    const context = { segment, segmentIndex, definition };
    // Each rule finds the issues of a segment in message order, and keeps the first of them when there are too many,
    // so the first issues of the segment in message order are among those the rules keep.
    const ofSegment = segmentRules.flatMap((rule) => {
      const ofRule: Issue[] = [];
      rule.check(context, ofRule);
      return ofRule;
    });
    found.push(...inMessageOrder(ofSegment).slice(0, room));
  }
  return found;
}
