// The Bundle around the resources of a message (ADR 0017), by the guide's map segment-msh-to-bundle: MSH-10, the
// message control ID, is its identifier, and MSH-7, the time of the message, its timestamp (an instant, so it is left
// out when no offset is known; ADR 0013).
//
// A `collection` (the default) is plain data. A `transaction` is executed by a FHIR server, which finds the Patient and
// the Encounter by their identifier, because each message about a patient would otherwise create the patient again:
// - An update event (A08 update patient information, A13 cancel discharge) changes what the server holds: the Patient
//   and the Encounter are a conditional update (`PUT Patient?identifier=...`), which replaces the one with the
//   identifier or creates it when there is none.
// - Any other event creates them only if the server has none with the identifier (a POST with `ifNoneExist`), so a
//   registration or admission does not overwrite what the server learned since.
// The identifier is the first with a system; without one, the entry is created unconditionally and
// CONDITIONAL_REQUEST_UNAVAILABLE says so. Observations and DiagnosticReports are always created (POST): v2.5.1 gives
// them no identifier a server could match, so a result message sent again, or corrected, creates them again.
import type { Bundle, BundleEntry, Identifier } from "fhir/r4";

import { compact, nonEmpty } from "./compact";
import { type MappingContext, reportIssue, text } from "./context";
import { mapTs } from "./datatypes/date-time";
import type { MappingCitation } from "./mapping-guide";
import type { MappedEntry } from "./messages/mapping";
import type { BundleType, MappedResource } from "./options";
import { field, segmentLocation, type SegmentAt } from "./resources/segment";

/** The rows of the guide's map for MSH as a Bundle. */
export const bundleCitation: MappingCitation = {
  conceptMap: "segment-msh-to-bundle",
  rows: ["MSH-7", "MSH-10"],
};

/** The resource types a transaction writes conditionally, because a server keeps one per real-world thing. */
const conditional: ReadonlySet<MappedResource["resourceType"]> = new Set([
  "Patient",
  "Encounter",
]);

/** The trigger events (MSH-9.2) that change a patient and a visit the receiver already has. */
const updateEvents: ReadonlySet<string> = new Set(["A08", "A13"]);

/** What decides the kind of bundle and its requests. */
export interface BundleSettings {
  readonly type: BundleType;
  /** The trigger event of the message (MSH-9.2), which decides between conditional create and update. */
  readonly event: string | undefined;
}

/**
 * Assembles the bundle of the resources of a message, in the order of `entries`.
 *
 * @param msh - The MSH segment of the message.
 */
export function assembleBundle(
  context: MappingContext,
  msh: SegmentAt,
  entries: readonly MappedEntry[],
  { type, event }: BundleSettings,
): Bundle<MappedResource> {
  const update = event !== undefined && updateEvents.has(event);
  const controlId = text(context, field(msh, 10));
  return {
    resourceType: "Bundle",
    ...compact({
      identifier: controlId === undefined ? undefined : { value: controlId },
    }),
    type,
    ...compact({
      timestamp: mapTs(context, field(msh, 7), "instant"),
      // A message without resources makes a bundle without entries.
      entry: nonEmpty(
        entries.map((entry): BundleEntry<MappedResource> =>
          type === "transaction"
            ? transactionEntry(context, entry, update)
            : { fullUrl: entry.fullUrl, resource: entry.resource },
        ),
      ),
    }),
  };
}

/** The entry of a resource in a transaction, with the request the rules at the top of this module give it. */
function transactionEntry(
  context: MappingContext,
  { fullUrl, resource, source }: MappedEntry,
  update: boolean,
): BundleEntry<MappedResource> {
  const { resourceType } = resource;
  const create: NonNullable<BundleEntry["request"]> = {
    method: "POST",
    url: resourceType,
  };
  if (!conditional.has(resourceType)) {
    return { fullUrl, resource, request: create };
  }
  const condition = searchByIdentifier(resource.identifier ?? []);
  if (condition === undefined) {
    reportIssue(
      context,
      "CONDITIONAL_REQUEST_UNAVAILABLE",
      segmentLocation(source),
    );
    return { fullUrl, resource, request: create };
  }
  const request: NonNullable<BundleEntry["request"]> = update
    ? { method: "PUT", url: `${resourceType}?${condition}` }
    : { ...create, ifNoneExist: condition };
  return { fullUrl, resource, request };
}

/** The search for the first identifier with a system and a value: `identifier=<system>|<value>`, URL-encoded. */
function searchByIdentifier(
  identifiers: readonly Identifier[],
): string | undefined {
  const found = identifiers.find(
    ({ system, value }) => system !== undefined && value !== undefined,
  );
  if (found?.system === undefined || found.value === undefined)
    return undefined;
  // The search syntax escapes `|`, `,` and `$` with a backslash before URL encoding.
  const escape = (part: string): string =>
    encodeURIComponent(part.replaceAll(/[\\|,$]/gu, "\\$&"));
  return `identifier=${escape(found.system)}|${escape(found.value)}`;
}
