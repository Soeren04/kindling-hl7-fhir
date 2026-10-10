// XTN (extended telecommunication number) to ContactPoint, by the guide's map:
// - The system comes from the equipment type (XTN.3, table 0202). Without one, an email address (XTN.4) makes it
//   `email`; otherwise FHIR, which requires a system for a value (invariant cpt-2), gets the data-absent-reason
//   `unknown` in its place. A cellular phone (`CP`) the guide maps to the use `mobile`; its system is `phone`.
// - The value of an email is the address (XTN.4) or, as a deviation from the guide, the deprecated free-text number
//   (XTN.1), where senders of version 2.5.1 put the address when XTN.4 is empty. The value of every other system is the
//   unformatted number (XTN.12), else the number assembled from country code, area code, local number and extension
//   (XTN.5 to XTN.8) as the guide writes it (`+1 555 5550123 X12`), else XTN.1.
// - A part that does not fit the system, an email address with a phone or phone parts with an email address, is left
//   out and reported (`CONTACT_DETAIL_DROPPED`), never dropped silently.
// - The use comes from XTN.2 (table 0201), else from the equipment type.
import type { ContactPoint } from "fhir/r4";

import { compact } from "../compact";
import { type MappingContext, present, reportIssue, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import {
  telecomEquipmentUse,
  telecomSystem,
  telecomUse,
  telecomUseUnmatched,
} from "../terminology/concept-maps";
import { mapCode } from "./code";

/** The guide's map for XTN. */
export const xtnCitation: MappingCitation = {
  conceptMap: "datatype-xtn-to-contactpoint",
  rows: [
    "XTN.1",
    "XTN.2",
    "XTN.3",
    "XTN.4",
    "XTN.5",
    "XTN.6",
    "XTN.7",
    "XTN.8",
    "XTN.12",
  ],
};

const dataAbsentReason =
  "http://hl7.org/fhir/StructureDefinition/data-absent-reason";

/** What the equipment type says: the system and, for a cellular phone, the use. */
type Equipment = Pick<ContactPoint, "system" | "use">;

/** Maps an XTN to a ContactPoint; `undefined` when it holds no number or address. */
export function mapXtn(
  context: MappingContext,
  source: Source | undefined,
): ContactPoint | undefined {
  const xtn = present(context, source);
  if (xtn === undefined) return undefined;
  const textOf = (n: number): string | undefined => textAt(context, xtn, n);
  const [freeText, email, country, area, local, extension, unformatted] = [
    1, 4, 5, 6, 7, 8, 12,
  ].map(textOf);
  const equipment = mapEquipment(context, part(xtn, 3), email);
  const isEmail = equipment.system === "email";
  const number =
    unformatted ?? assembledNumber(country, area, local, extension);
  const value = isEmail ? (email ?? freeText) : (number ?? freeText);
  // The part the system has no room for: the address of a phone, or the first number part of an address.
  const dropped = isEmail
    ? firstDetail([
        [12, unformatted],
        [5, country],
        [6, area],
        [7, local],
        [8, extension],
      ])
    : firstDetail([[4, email]]);
  if (dropped !== undefined) {
    reportIssue(
      context,
      "CONTACT_DETAIL_DROPPED",
      part(xtn, dropped.component)?.location ?? xtn.location,
      dropped.text,
    );
  }
  if (value === undefined) return undefined;
  const use = mapCode(context, part(xtn, 2), telecomUse, {
    unmatched: telecomUseUnmatched,
  });
  return compact({
    system: equipment.system,
    _system:
      equipment.system === undefined
        ? { extension: [{ url: dataAbsentReason, valueCode: "unknown" }] }
        : undefined,
    value,
    use: use ?? equipment.use,
  });
}

/**
 * What the equipment type (XTN.3) says. A code it does not know says nothing and is reported; without a code, an email
 * address makes it an email.
 */
function mapEquipment(
  context: MappingContext,
  source: Source | undefined,
  email: string | undefined,
): Equipment {
  const known = mapCode(
    context,
    source,
    (code): Equipment | undefined => {
      const system = telecomSystem(code);
      if (system !== undefined) return { system };
      const use = telecomEquipmentUse(code);
      return use === undefined ? undefined : { system: "phone", use };
    },
    { kept: () => ({}) },
  );
  return known ?? (email === undefined ? {} : { system: "email" });
}

/** The first of the components that has a text, with its number. */
function firstDetail(
  details: readonly (readonly [number, string | undefined])[],
): { readonly component: number; readonly text: string } | undefined {
  for (const [component, text] of details) {
    if (text !== undefined) return { component, text };
  }
  return undefined;
}

/** The number of XTN.5 to XTN.8 written as the guide writes it; `undefined` without a local number (XTN.7). */
function assembledNumber(
  country: string | undefined,
  area: string | undefined,
  local: string | undefined,
  extension: string | undefined,
): string | undefined {
  if (local === undefined) return undefined;
  const number = [
    country === undefined ? undefined : `+${country}`,
    area,
    local,
  ]
    .filter((piece) => piece !== undefined)
    .join(" ");
  return extension === undefined ? number : `${number} X${extension}`;
}
