// XAD (extended address) to Address. The street address (XAD.1, an SAD) gives up to three lines and the other
// designation (XAD.2) one more. The address type (XAD.7, table 0190) becomes the use or the type, by the guide's two
// ConceptMaps. XAD.13 and XAD.14 give the period, or else the range of XAD.12.
import type { Address } from "fhir/r4";

import { compact } from "../compact";
import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import {
  addressType,
  addressUnmatched,
  addressUse,
} from "../terminology/concept-maps";
import { mapCode } from "./code";
import { mapDr, mapTs, period } from "./date-time";

/** The guide's maps for XAD and SAD, its street address. */
export const xadCitations: readonly MappingCitation[] = [
  {
    conceptMap: "datatype-xad-to-address",
    rows: [
      "XAD.1",
      "XAD.2",
      "XAD.3",
      "XAD.4",
      "XAD.5",
      "XAD.6",
      "XAD.7",
      "XAD.9",
      "XAD.12",
      "XAD.13",
      "XAD.14",
    ],
  },
  { conceptMap: "datatype-sad-to-address", rows: ["SAD.1", "SAD.2", "SAD.3"] },
];

/** Maps an XAD to an Address; `undefined` when it holds no part of an address. */
export function mapXad(
  context: MappingContext,
  source: Source | undefined,
): Address | undefined {
  const xad = present(context, source);
  if (xad === undefined) return undefined;
  const street = part(xad, 1);
  const line = [
    textAt(context, street, 1),
    textAt(context, street, 2),
    textAt(context, street, 3),
    textAt(context, xad, 2),
  ].filter((piece) => piece !== undefined);
  const parts = compact({
    line: line.length === 0 ? undefined : line,
    city: textAt(context, xad, 3),
    district: textAt(context, xad, 9),
    state: textAt(context, xad, 4),
    postalCode: textAt(context, xad, 5),
    country: textAt(context, xad, 6),
  });
  if (Object.keys(parts).length === 0) return undefined;
  return compact({
    ...mapAddressType(context, part(xad, 7)),
    ...parts,
    period:
      period(mapTs(context, part(xad, 13)), mapTs(context, part(xad, 14))) ??
      mapDr(context, part(xad, 12)),
  });
}

/**
 * The use or type of an address type code (table 0190), by the guide's ConceptMaps: a code is a use or a type, never
 * both.
 */
function mapAddressType(
  context: MappingContext,
  source: Source | undefined,
): Pick<Address, "use" | "type"> | undefined {
  return mapCode(
    context,
    source,
    (code): Pick<Address, "use" | "type"> | undefined => {
      const use = addressUse(code);
      if (use !== undefined) return { use };
      const type = addressType(code);
      return type === undefined ? undefined : { type };
    },
    { unmatched: addressUnmatched },
  );
}
