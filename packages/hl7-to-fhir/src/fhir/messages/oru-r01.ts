// Messages of the structure ORU_R01 to Patients, Encounters, DiagnosticReports and Observations, by the guide's map
// message-oru-r01-to-bundle, walking the segment groups of the structure:
//
// - Each PATIENT_RESULT: the Patient of its PATIENT group and the Encounter of its VISIT group, if present.
// - Each ORDER_OBSERVATION: a DiagnosticReport of its OBR (and ORC), whose results are the Observations of the OBX
//   segments of its OBSERVATION groups (with their NTE segments as notes) and of its SPECIMEN groups, all linked to
//   the Patient and Encounter of their PATIENT_RESULT. Encapsulated data becomes the report's presentedForm.
//
// The guide also creates MessageHeader, Provenance, ServiceRequest, Specimen and PractitionerRole resources; the
// library maps the four resources of its scope (ADR 0017). In bundle order, the report comes before its observations.
import type { GroupChild, MessageGroups } from "../../hl7v2/group";
import type { MappingCitation } from "../mapping-guide";
import { mapDiagnosticReport } from "../resources/diagnostic-report";
import {
  groupsOf,
  type MappedEntry,
  type MessageMapping,
  segmentOf,
  segmentsOf,
} from "./mapping";
import { mapObservations, type ObservationSegments } from "./observations";
import { mapVisit } from "./visit";

/** The rows of the guide's map for ORU_R01 the mapper implements. */
export const oruR01Citation: MappingCitation = {
  conceptMap: "message-oru-r01-to-bundle",
  rows: [
    "ORU_R01.MSH",
    "ORU_R01.PATIENT_RESULT.PATIENT.PID",
    "ORU_R01.PATIENT_RESULT.PATIENT.VISIT.PV1",
    "ORU_R01.PATIENT_RESULT.PATIENT.VISIT.PV2",
    "ORU_R01.PATIENT_RESULT.ORDER_OBSERVATION.COMMON_ORDER.ORC",
    "ORU_R01.PATIENT_RESULT.ORDER_OBSERVATION.OBR",
    "ORU_R01.PATIENT_RESULT.ORDER_OBSERVATION.OBSERVATION.OBX",
    "ORU_R01.PATIENT_RESULT.ORDER_OBSERVATION.OBSERVATION.NTE",
    "ORU_R01.PATIENT_RESULT.ORDER_OBSERVATION.SPECIMEN.SPECIMEN_OBSERVATION.OBX",
  ],
};

/** Maps a message of structure ORU_R01 by the groups at the top of this module. */
export function mapOruR01(
  mapping: MessageMapping,
  groups: MessageGroups,
): MappedEntry[] {
  return groupsOf(groups.children, "PATIENT_RESULT").flatMap((result) =>
    mapPatientResult(mapping, result.children),
  );
}

function mapPatientResult(
  mapping: MessageMapping,
  children: readonly GroupChild[],
): MappedEntry[] {
  const { message } = mapping;
  const patient = groupsOf(children, "PATIENT")[0]?.children ?? [];
  const visitGroup = groupsOf(patient, "VISIT")[0]?.children ?? [];
  const visit = mapVisit(mapping, {
    pid: segmentOf(message, patient, "PID"),
    pv1: segmentOf(message, visitGroup, "PV1"),
    pv2: segmentOf(message, visitGroup, "PV2"),
    event: undefined,
  });
  const orders = groupsOf(children, "ORDER_OBSERVATION").flatMap((order) =>
    mapOrder(mapping, order.children, visit),
  );
  return [...visit.entries, ...orders];
}

function mapOrder(
  mapping: MessageMapping,
  children: readonly GroupChild[],
  {
    patient,
    encounter,
  }: {
    readonly patient: string | undefined;
    readonly encounter: string | undefined;
  },
): MappedEntry[] {
  const { context, message, nextUrl, markMapped } = mapping;
  const obr = segmentOf(message, children, "OBR");
  // The report's fullUrl comes before those of its observations, so the ids follow the bundle order.
  const report = obr === undefined ? undefined : nextUrl(obr);
  const observations = mapObservations(
    mapping,
    observationSegments(mapping, children),
    { subject: patient, encounter, order: obr },
  );
  if (obr === undefined || report === undefined)
    return [...observations.entries];
  const orc = segmentOf(message, children, "ORC");
  markMapped(obr);
  if (orc !== undefined) markMapped(orc);
  const resource = mapDiagnosticReport(context, obr, orc, {
    subject: patient,
    encounter,
    results: observations.entries.map(({ fullUrl }) => fullUrl),
    presentedForm: observations.attachments,
  });
  return [{ fullUrl: report, resource, source: obr }, ...observations.entries];
}

/** The OBX segments of an order, with the NTE segments of their OBSERVATION group, in message order. */
function observationSegments(
  { message }: MessageMapping,
  children: readonly GroupChild[],
): ObservationSegments[] {
  return children.flatMap((child): ObservationSegments[] => {
    if (child.kind !== "group") return [];
    if (child.name === "OBSERVATION") {
      const obx = segmentOf(message, child.children, "OBX");
      return obx === undefined
        ? []
        : [{ obx, notes: segmentsOf(message, child.children, "NTE") }];
    }
    if (child.name === "SPECIMEN") {
      return segmentsOf(message, child.children, "OBX").map((obx) => ({
        obx,
        notes: [],
      }));
    }
    return [];
  });
}
