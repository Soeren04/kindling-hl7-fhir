import type { Issue } from "../shared/issue";
import { report } from "../shared/collect";
import { emptySpanAt } from "../shared/span";
import { checkSegmentDefinition } from "./definition-check";
import type { SegmentDefinition } from "./definitions/types";

/**
 * The options of `validate` and `group`: definitions of segments the library does not define.
 *
 * @example
 * ```ts
 * import { defineSegment, type DefinitionOptions } from "hl7-to-fhir/hl7v2";
 *
 * const options: DefinitionOptions = {
 *   segments: [defineSegment({ id: "ZPI", fields: [{ name: "setId", dataType: "SI" }] })],
 * };
 * ```
 */
export interface DefinitionOptions {
  /**
   * Definitions of segments the library does not define, typically Z segments, made with `defineSegment`. A segment
   * with a definition is allowed wherever the message structure does not contain it, its fields are checked against
   * the definition in every message version, and a definition with the identifier of a built-in segment replaces it.
   * Of several definitions with one identifier, the last counts. A definition that was not made with `defineSegment`
   * and does not have its shape is ignored and reported as `INVALID_DEFINITION`.
   */
  readonly segments?: readonly SegmentDefinition[] | undefined;
}

/**
 * The caller's valid segment definitions by identifier.
 *
 * @param options - The options as passed in, which plain JavaScript callers can make anything.
 * @param issues - Receives one `INVALID_DEFINITION` for each definition that is ignored, or one for options that are
 *   not an object with an array of definitions.
 */
export function definitionsOf(
  options: unknown,
  issues: Issue[],
): ReadonlyMap<string, SegmentDefinition> {
  const definitions = new Map<string, SegmentDefinition>();
  const segments = segmentsOf(options);
  if (segments === undefined) {
    const problem =
      "options must be an object whose segments, if any, are an array of segment definitions";
    reportInvalid(issues, problem);
    return definitions;
  }
  for (const [index, definition] of segments.entries()) {
    const checked = checkSegmentDefinition(definition);
    if (checked.ok) {
      definitions.set(checked.value.id, checked.value);
    } else {
      const path = `options.segments[${String(index)}]`;
      reportInvalid(issues, `${path}: ${checked.error.message}`);
    }
  }
  return definitions;
}

/** The definitions in the options, `[]` when there are none, or `undefined` when the options cannot hold any. */
function segmentsOf(options: unknown): readonly unknown[] | undefined {
  if (typeof options !== "object" || options === null) return undefined;
  const segments: unknown = "segments" in options ? options.segments : [];
  if (segments === undefined) return [];
  return Array.isArray(segments) ? segments : undefined;
}

function reportInvalid(issues: Issue[], problem: string): void {
  report(issues, "INVALID_DEFINITION", { span: emptySpanAt(0) }, problem);
}
