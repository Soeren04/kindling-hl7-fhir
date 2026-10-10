// PL (person location) to a logical reference to a Location. The guide maps PL to a hierarchy of up to six Location
// resources (bed in room in point of care, ...); this library does not create them, so the reference carries the
// comprehensive location identifier (PL.10, an EI) when there is one, and a display: the location description (PL.9),
// or else the parts of the location in PL component order, with the facility (PL.4), which sits among them, last:
// point of care, room, bed, building, floor and facility.
import type { Reference } from "fhir/r4";

import { compact } from "../compact";
import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { mapEi } from "./ei";

/** The rows of the guide's PL-to-Location map that the reference carries. */
export const plCitation: MappingCitation = {
  conceptMap: "datatype-pl-to-location",
  rows: ["PL.1", "PL.2", "PL.3", "PL.4", "PL.7", "PL.8", "PL.9", "PL.10"],
};

/** Maps a PL to a logical Location reference; `undefined` when it holds no location. */
export function mapPl(
  context: MappingContext,
  source: Source | undefined,
): Reference | undefined {
  const pl = present(context, source);
  if (pl === undefined) return undefined;
  const facility = part(pl, 4);
  const parts = [
    textAt(context, pl, 1),
    textAt(context, pl, 2),
    textAt(context, pl, 3),
    textAt(context, pl, 7),
    textAt(context, pl, 8),
    textAt(context, facility, 1) ?? textAt(context, facility, 2),
  ].filter((piece) => piece !== undefined);
  const display =
    textAt(context, pl, 9) ??
    (parts.length === 0 ? undefined : parts.join(", "));
  const identifier = mapEi(context, part(pl, 10));
  if (display === undefined && identifier === undefined) return undefined;
  return compact({ type: "Location", identifier, display });
}
