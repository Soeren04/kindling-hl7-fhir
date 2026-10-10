// Yes/no indicators (table 0136) to FHIR booleans.
import { mapCode } from "../datatypes/code";
import type { MappingContext } from "../context";
import type { Source } from "../source";

const yesNo: ReadonlyMap<string, boolean> = new Map([
  ["Y", true],
  ["N", false],
]);

/** The boolean of a table 0136 indicator (`Y`, `N`); another code is reported as `UNMAPPED_CODE`. */
export function mapYesNo(
  context: MappingContext,
  source: Source | undefined,
): boolean | undefined {
  return mapCode(context, source, (code) => yesNo.get(code));
}
