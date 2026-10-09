import type { Issue } from "../shared/issue";
import { finishIssues, inMessageOrder, maxIssues } from "../shared/collect";
import { type DefinitionOptions, definitionsOf } from "./definition-options";
import { segmentDefinitions } from "./definitions/segment-definitions";
import type { SegmentDefinition } from "./definitions/types";
import { endOfMessage, groupSegments } from "./group";
import type { Hl7Message } from "./model";
import { shapeIssue } from "./tree-check";
import { segmentRules } from "./validate/rules/segment-rules";
import { checkVersion } from "./validate/rules/version";

/**
 * Checks a message against HL7 v2.5.1 and returns everything that deviates from it: the issues `group` reports about
 * the message structure and the order of the segments, and the issues of the fields and values of every segment the
 * library or `options` defines (required fields, repetitions, components, the formats of numbers, dates, times and
 * codes, and codes of the shipped HL7 tables), together in message order.
 *
 * Parsing is lenient and validation strict: `parse` accepts what it can read, `validate` reports everything that
 * deviates from the standard, so callers decide what to block. Every issue has a stable code, an exact location and,
 * for a value, the value in `value`; the message never contains message content, but `value` may, so do not log it
 * unless your logs may hold patient data.
 *
 * - The built-in definitions are those of version 2.5.1. For a message whose MSH-12 is not 2.5 or 2.5.x, the segments
 *   are neither checked for their order nor against the built-in definitions, only against the definitions in
 *   `options`, and an `UNSUPPORTED_VERSION` note says so.
 * - Z segments and segments the structure does not contain are never dropped; they are reported unless `options`
 *   defines them.
 *
 * It takes time linear in the size of the message and never throws: a tree that does not have the shape of a
 * message, possible only from plain JavaScript, yields one `INVALID_TREE` issue, and a definition in `options` that was
 * not made with `defineSegment` and does not have its shape is ignored and reported as `INVALID_DEFINITION`.
 *
 * @param message - A message from `parse`.
 * @param options - Definitions of further segments, such as Z segments made with `defineSegment`.
 * @returns The first 10,000 issues in message order, followed by `TOO_MANY_ISSUES` when there are more; empty for a
 *   valid message.
 *
 * @example
 * ```ts
 * import { parse, validate } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse(
 *   "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|MSG00001|P|2.5.1\rEVN||20240115103000\rPID|1||12345||Everyman^Adam||19800231|Q",
 * );
 * if (result.ok) {
 *   const issues = validate(result.value.message);
 *   issues.map(({ severity, code, location }) => `${severity} ${code} ${location.segmentId ?? ""}`);
 *   // => ["error INVALID_DATE_TIME PID", "warning UNKNOWN_USER_DEFINED_CODE PID", "error SEGMENT_MISSING PV1"]
 *   issues[0]?.value; // => "19800231"
 * }
 * ```
 */
export function validate(
  message: Hl7Message,
  options: DefinitionOptions = {},
): readonly Issue[] {
  const problem = shapeIssue(message);
  if (problem !== undefined) return [problem];
  const issues: Issue[] = [];
  const callers = definitionsOf(options, issues);
  const builtIn = checkVersion(message, issues);
  groupSegments(message, (id) => callers.has(id), issues);
  const fieldIssues = checkSegments(
    message,
    (id) =>
      callers.get(id) ?? (builtIn ? segmentDefinitions.get(id) : undefined),
  );
  return finishIssues(issues.concat(fieldIssues), endOfMessage(message));
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
