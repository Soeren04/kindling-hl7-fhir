// What every coded component with a ConceptMap has in common: read the code, look it up, say so when it has no
// equivalent. One rule for all lookups, so a user learns one behavior:
// - a code the guide lists as having no FHIR equivalent ("unmatched") is left out silently: the guide decided it, and
//   nothing the user could fix is wrong;
// - any other code the lookup does not know is reported as `UNMAPPED_CODE`: it may be a typo or a site code.
import { type MappingContext, reportIssue, text } from "../context";
import type { Source } from "../source";

/** How {@link mapCode} treats a code that has no equivalent. */
export interface CodeMapOptions<T> {
  /** The codes the guide lists as deliberately without a FHIR equivalent; they are left out without an issue. */
  readonly unmatched?: ReadonlySet<string> | undefined;
  /** What to use instead for a code that is reported; without it the code is left out. */
  readonly kept?: ((code: string) => T) | undefined;
}

/**
 * The FHIR value of the code in `source`; `undefined` when there is no code, when the guide lists it as unmatched, or
 * when the lookup does not know it, which is reported as `UNMAPPED_CODE` at the code with the code as its value.
 *
 * @param lookup - The FHIR value of a code, or `undefined` for a code the lookup does not map.
 *
 * @example
 * ```ts
 * const use = mapCode(context, part(xpn, 7), nameUse, { unmatched: nameUseUnmatched });
 * ```
 */
export function mapCode<T>(
  context: MappingContext,
  source: Source | undefined,
  lookup: (code: string) => T | undefined,
  { unmatched, kept }: CodeMapOptions<T> = {},
): T | undefined {
  const code = text(context, source);
  if (source === undefined || code === undefined) return undefined;
  const mapped = lookup(code);
  if (mapped !== undefined) return mapped;
  if (unmatched?.has(code) === true) return undefined;
  reportIssue(context, "UNMAPPED_CODE", source.location, code);
  return kept?.(code);
}
