// CX (extended composite ID with check digit) to Identifier. CX.4, the assigning authority, gives the system (see
// ./hd.ts); CX.5 the type; CX.7 and CX.8 the period. CX.2 and CX.3 (check digit and scheme) are not mapped: receivers
// validate identifiers by their system, not by a check digit the sender computed.
import type { Identifier } from "fhir/r4";

import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { mapDt, period } from "./date-time";
import { readHd } from "./hd";
import { buildIdentifier, identifierType } from "./identifier";

/** The guide's map for CX. */
export const cxCitation: MappingCitation = {
  conceptMap: "datatype-cx-to-identifier",
  rows: ["CX.1", "CX.4", "CX.5", "CX.7", "CX.8"],
};

/** Maps a CX to an Identifier; `undefined` when it has no ID number (CX.1). */
export function mapCx(
  context: MappingContext,
  source: Source | undefined,
): Identifier | undefined {
  const cx = present(context, source);
  const value = textAt(context, cx, 1);
  if (cx === undefined || value === undefined) return undefined;
  return buildIdentifier(context, {
    value,
    authority: readHd(context, part(cx, 4)),
    type: identifierType(context, part(cx, 5)),
    period: period(mapDt(context, part(cx, 7)), mapDt(context, part(cx, 8))),
  });
}
