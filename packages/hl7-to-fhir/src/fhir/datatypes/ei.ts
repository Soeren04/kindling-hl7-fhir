// EI (entity identifier) to Identifier: EI.1 is the value, and EI.2 to EI.4 are an assigning authority laid out like
// HD.1 to HD.3, resolved to the system as for CX.4 (see ./hd.ts).
import type { Identifier } from "fhir/r4";

import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import type { Source } from "../source";
import { readHd } from "./hd";
import { buildIdentifier } from "./identifier";

/** The guide's map for EI as an identifier with a system. */
export const eiCitation: MappingCitation = {
  conceptMap: "datatype-ei-system-to-identifier",
  rows: ["EI.1", "EI.2", "EI.3"],
};

/** Maps an EI to an Identifier; `undefined` when it has no entity identifier (EI.1). */
export function mapEi(
  context: MappingContext,
  source: Source | undefined,
): Identifier | undefined {
  const ei = present(context, source);
  const value = textAt(context, ei, 1);
  if (ei === undefined || value === undefined) return undefined;
  return buildIdentifier(context, {
    value,
    authority: readHd(context, ei, 2),
  });
}
