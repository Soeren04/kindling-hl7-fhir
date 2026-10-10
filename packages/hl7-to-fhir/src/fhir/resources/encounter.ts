// PV1 and PV2 to Encounter, by the guide's maps segment-pv1-to-encounter and segment-pv2-to-encounter.
//
// FHIR requires a status and a class:
// - The class is the patient class (PV1-2) through the guide's ConceptMap of table 0004. Without a patient class, it
//   is an element with the data-absent-reason `unknown` (REQUIRED_ELEMENT_DEFAULTED); with a code the map does not
//   have, the same (UNMAPPED_CODE).
// - The status follows the trigger event and the discharge date (PV1-45), in this order:
//   1. A13 (cancel discharge): `in-progress`, the visit continues whatever PV1-45 still holds.
//   2. A discharge date in PV1-45: `finished`, as the guide's row for PV1-45 says.
//   3. A01 (admit) and A04 (register): `in-progress`, the patient has arrived.
//   4. Any other event, such as A08 (update), and messages without an ADT event (ORU^R01): the patient class through
//      the guide's map table-hl70004-to-encounter-status (`P` pre-admit is `planned`, `U` is `unknown`, the others
//      `in-progress`), as the guide's row for PV1-2 says when PV1-45 is empty. Without a known class: `unknown`, which
//      the class already reports.
// Practitioners (PV1-7, -8, -9, -17) and locations (PV1-3, -6) are logical references (ADR 0014).
import type {
  CodeableConcept,
  Encounter,
  EncounterLocation,
  EncounterParticipant,
  Identifier,
} from "fhir/r4";

import { compact, nonEmpty } from "../compact";
import { mapCode } from "../datatypes/code";
import { type MappingContext, reportIssue, text } from "../context";
import { mapCwe } from "../datatypes/cwe";
import { mapCx } from "../datatypes/cx";
import { mapTs, period } from "../datatypes/date-time";
import { mapPl } from "../datatypes/pl";
import { mapXcn } from "../datatypes/xcn";
import type { MappingCitation } from "../mapping-guide";
import { v2TableSystem } from "../terminology/coding-systems";
import { encounterClass } from "../terminology/concept-maps";
import { absentElement } from "./absent";
import {
  field,
  fieldLocation,
  isValued,
  repetitions,
  type SegmentAt,
} from "./segment";

/** The rows of the guide's maps for PV1 and PV2 that the Encounter carries, and the map of its status. */
export const encounterCitations: readonly MappingCitation[] = [
  {
    conceptMap: "segment-pv1-to-encounter",
    rows: [
      "PV1-2",
      "PV1-3",
      "PV1-4",
      "PV1-5",
      "PV1-6",
      "PV1-7",
      "PV1-8",
      "PV1-9",
      "PV1-17",
      "PV1-19",
      "PV1-44",
      "PV1-45",
    ],
  },
  { conceptMap: "segment-pv2-to-encounter", rows: ["PV2-3"] },
  {
    conceptMap: "table-hl70004-to-encounter-status",
    rows: ["E", "I", "O", "P", "R", "B", "C", "N", "U"],
  },
];

type EncounterStatus = Encounter["status"];

/** Table 0004 (patient class) to Encounter.status, the guide's map table-hl70004-to-encounter-status. */
const statusByClass: ReadonlyMap<string, EncounterStatus> = new Map([
  ["E", "in-progress"],
  ["I", "in-progress"],
  ["O", "in-progress"],
  ["P", "planned"],
  ["R", "in-progress"],
  ["B", "in-progress"],
  ["C", "in-progress"],
  ["N", "in-progress"],
  ["U", "unknown"],
]);

/** The participant types of the guide's rows, from the v3 code system ParticipationType. */
const participantFields = [
  { field: 7, code: "ATND", display: "attender" },
  { field: 8, code: "REF", display: "referrer" },
  { field: 9, code: "CON", display: "consultant" },
  { field: 17, code: "ADM", display: "admitter" },
] as const;

const participationType =
  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType";

/** What an Encounter is mapped from besides its segments. */
export interface EncounterLinks {
  /** The trigger event of an ADT message (MSH-9.2), such as `A01`; absent for other messages. */
  readonly event: string | undefined;
  /** The fullUrl of the Patient of the visit, if there is one. */
  readonly subject: string | undefined;
}

/** Maps a PV1 segment, and the PV2 segment after it if there is one, to an Encounter. */
export function mapEncounter(
  context: MappingContext,
  pv1: SegmentAt,
  pv2: SegmentAt | undefined,
  { event, subject }: EncounterLinks,
): Encounter {
  const patientClass = text(context, field(pv1, 2));
  const discharge = field(pv1, 45);
  const locations = [
    ...locationsOf(
      context,
      pv1,
      3,
      patientClass === "P" ? "planned" : "active",
    ),
    ...locationsOf(context, pv1, 6, "completed"),
  ];
  return {
    resourceType: "Encounter",
    ...compact({ identifier: visitNumber(context, pv1) }),
    status: encounterStatus(event, patientClass, isValued(discharge)),
    class: classOf(context, pv1, patientClass),
    ...compact({
      type: list(mapCwe(context, field(pv1, 4), "0007")),
      subject: subject === undefined ? undefined : { reference: subject },
      participant: participants(context, pv1),
      period: period(mapTs(context, field(pv1, 44)), mapTs(context, discharge)),
      reasonCode: pv2 === undefined ? undefined : reasons(context, pv2),
      hospitalization: preAdmission(context, pv1),
      location: nonEmpty(locations),
    }),
  };
}

/**
 * The status of an Encounter by the rules at the top of this module.
 *
 * @param event - The trigger event (MSH-9.2), absent outside ADT messages.
 * @param patientClass - The code of PV1-2.
 * @param discharged - Whether PV1-45, the discharge date, holds a value.
 */
export function encounterStatus(
  event: string | undefined,
  patientClass: string | undefined,
  discharged: boolean,
): EncounterStatus {
  if (event === "A13") return "in-progress";
  if (discharged) return "finished";
  if (event === "A01" || event === "A04") return "in-progress";
  return (
    (patientClass === undefined
      ? undefined
      : statusByClass.get(patientClass)) ?? "unknown"
  );
}

/** The class of the patient class in PV1-2, or an element with the reason why it is absent. */
function classOf(
  context: MappingContext,
  pv1: SegmentAt,
  patientClass: string | undefined,
): Encounter["class"] {
  if (patientClass === undefined) {
    reportIssue(context, "REQUIRED_ELEMENT_DEFAULTED", fieldLocation(pv1, 2));
    return absentElement("unknown");
  }
  const coding = mapCode(context, field(pv1, 2), encounterClass);
  return coding === undefined ? absentElement("unknown") : { ...coding };
}

/** The visit number of PV1-19, typed `VN` unless CX.5 gives another type. */
function visitNumber(
  context: MappingContext,
  pv1: SegmentAt,
): Identifier[] | undefined {
  const identifier = mapCx(context, field(pv1, 19));
  if (identifier === undefined) return undefined;
  const type: CodeableConcept = identifier.type ?? {
    coding: [{ system: v2TableSystem("0203"), code: "VN" }],
  };
  return [{ ...identifier, type }];
}

function participants(
  context: MappingContext,
  pv1: SegmentAt,
): EncounterParticipant[] | undefined {
  return nonEmpty(
    participantFields.flatMap(({ field: n, code, display }) =>
      repetitions(pv1, n)
        .map((source) => mapXcn(context, source))
        .filter((individual) => individual !== undefined)
        .map((individual): EncounterParticipant => ({
          type: [{ coding: [{ system: participationType, code, display }] }],
          individual,
        })),
    ),
  );
}

function locationsOf(
  context: MappingContext,
  pv1: SegmentAt,
  n: number,
  status: NonNullable<EncounterLocation["status"]>,
): EncounterLocation[] {
  const location = mapPl(context, field(pv1, n));
  return location === undefined ? [] : [{ location, status }];
}

function reasons(
  context: MappingContext,
  pv2: SegmentAt,
): CodeableConcept[] | undefined {
  return list(mapCwe(context, field(pv2, 3)));
}

function preAdmission(
  context: MappingContext,
  pv1: SegmentAt,
): Encounter["hospitalization"] {
  const identifier = mapCx(context, field(pv1, 5));
  return identifier === undefined
    ? undefined
    : { preAdmissionIdentifier: identifier };
}

function list<T>(value: T | undefined): T[] | undefined {
  return value === undefined ? undefined : [value];
}
