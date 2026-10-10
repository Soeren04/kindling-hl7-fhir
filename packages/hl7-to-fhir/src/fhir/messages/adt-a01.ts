// Messages of the structure ADT_A01 (events A01 admit, A04 register, A08 update and A13 cancel discharge, by HL7
// table 0354) to a Patient, an Encounter and the Observations of its OBX segments, by the guide's map
// message-adt-a01-to-bundle. The guide also creates MessageHeader, Provenance, Account, Coverage, RelatedPerson and
// other resources from it; the library maps the four resources of its scope (ADR 0017).
import { get } from "../../hl7v2/access";
import type { MessageGroups } from "../../hl7v2/group";
import type { MappingCitation } from "../mapping-guide";
import {
  segmentOf,
  segmentsOf,
  type MappedEntry,
  type MessageMapping,
} from "./mapping";
import { mapObservations } from "./observations";
import { mapVisit } from "./visit";

/** The rows of the guide's map for ADT_A01 the mapper implements. */
export const adtA01Citation: MappingCitation = {
  conceptMap: "message-adt-a01-to-bundle",
  rows: [
    "ADT_A01.MSH",
    "ADT_A01.PID",
    "ADT_A01.PV1",
    "ADT_A01.PV2",
    "ADT_A01.OBSERVATION.OBX",
  ],
};

/**
 * Maps a message of structure ADT_A01. All segments it maps are at the top level of the structure; of segments that
 * occur more often than the structure allows, the first counts (validation reports the others).
 *
 * The observations refer to the Encounter, except in a registration (A04): the guide's row for OBX leaves the link to
 * the implementer, but notes that observations of an event before the visit, such as the registration, do not belong
 * to it.
 */
export function mapAdtA01(
  mapping: MessageMapping,
  groups: MessageGroups,
): MappedEntry[] {
  const { message } = mapping;
  const { children } = groups;
  const event = get(message, "MSH.9.2");
  const visit = mapVisit(mapping, {
    pid: segmentOf(message, children, "PID"),
    pv1: segmentOf(message, children, "PV1"),
    pv2: segmentOf(message, children, "PV2"),
    event,
  });
  const observations = mapObservations(
    mapping,
    segmentsOf(message, children, "OBX").map((obx) => ({ obx, notes: [] })),
    {
      subject: visit.patient,
      encounter: event === "A04" ? undefined : visit.encounter,
      order: undefined,
    },
  );
  return [...visit.entries, ...observations.entries];
}
