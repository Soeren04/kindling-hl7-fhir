// XCN (extended composite ID number and name for persons) to a logical reference to a Practitioner: the ID number
// with its assigning authority and type is the identifier of the reference, and the name its display. The guide maps
// XCN to a Practitioner resource; this library does not create one, so the reference is resolved by identifier, by the
// receiver, instead of pointing to a resource in the bundle.
import type { Reference } from "fhir/r4";

import { compact } from "../compact";
import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { readHd } from "./hd";
import { buildIdentifier, identifierType } from "./identifier";
import { formatName, humanName } from "./xpn";

/** The rows of the guide's XCN-to-Practitioner map that the reference carries. */
export const xcnCitation: MappingCitation = {
  conceptMap: "datatype-xcn-to-practitioner",
  rows: [
    "XCN.1",
    "XCN.2",
    "XCN.3",
    "XCN.4",
    "XCN.5",
    "XCN.6",
    "XCN.9",
    "XCN.13",
    "XCN.21",
  ],
};

/** Maps an XCN to a logical Practitioner reference; `undefined` when it holds neither an ID number nor a name. */
export function mapXcn(
  context: MappingContext,
  source: Source | undefined,
): Reference | undefined {
  const xcn = present(context, source);
  if (xcn === undefined) return undefined;
  const name = humanName({
    family: textAt(context, part(xcn, 2), 1),
    given: [textAt(context, xcn, 3), textAt(context, xcn, 4)],
    prefix: [textAt(context, xcn, 6)],
    suffix: [textAt(context, xcn, 5), textAt(context, xcn, 21)],
  });
  const value = textAt(context, xcn, 1);
  if (value === undefined && name === undefined) return undefined;
  const identifier =
    value === undefined
      ? undefined
      : buildIdentifier(context, {
          value,
          authority: readHd(context, part(xcn, 9)),
          type: identifierType(context, part(xcn, 13)),
        });
  return compact({
    type: "Practitioner",
    identifier,
    display: name === undefined ? undefined : formatName(name),
  });
}
