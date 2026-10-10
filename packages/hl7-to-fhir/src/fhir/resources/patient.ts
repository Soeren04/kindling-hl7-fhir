// PID to Patient, by the guide's map segment-pid-to-patient.
//
// - Identifiers: PID-3, the patient identifier list, then the deprecated PID-2 and PID-4, which 2.5.1 keeps for
//   backward compatibility.
// - Names: PID-5, then the deprecated aliases of PID-9.
// - Birth: PID-7 gives the birth date; a time of birth, which a FHIR date cannot hold, goes into the extension
//   patient-birthTime as the guide maps it, so `birthDate` loses nothing.
// - Gender: PID-8 through the guide's ConceptMap of table 0001. Ambiguous (A) and not applicable (N) share the FHIR
//   code `other` with O, so the code as sent is preserved in the originalText extension of `gender` whenever its FHIR
//   code stands for more than one code of the table; a receiver can tell the three apart.
// - Telecom: PID-13 (home) and PID-14 (business) take the use the guide assigns when XTN.2 does not give one.
// - Deceased and multiple birth: the date and time (PID-29) or birth order (PID-25) wins over the indicator (PID-30,
//   PID-24), as the guide's conditions say.
import type { ContactPoint, Extension, Patient } from "fhir/r4";

import { compact, nonEmpty } from "../compact";
import { mapCode } from "../datatypes/code";
import { type MappingContext, text } from "../context";
import { mapCx } from "../datatypes/cx";
import { mapTs } from "../datatypes/date-time";
import { mapNm } from "../datatypes/nm";
import { mapXad } from "../datatypes/xad";
import { mapXpn } from "../datatypes/xpn";
import { mapXtn } from "../datatypes/xtn";
import type { MappingCitation } from "../mapping-guide";
import type { Source } from "../source";
import {
  type AdministrativeGender,
  administrativeGender,
  administrativeGenderMap,
} from "../terminology/concept-maps";
import { mapYesNo } from "./indicator";
import { field, repetitions, type SegmentAt } from "./segment";

/** The rows of the guide's map for PID that the Patient carries. */
export const patientCitation: MappingCitation = {
  conceptMap: "segment-pid-to-patient",
  rows: [
    "PID-2",
    "PID-3",
    "PID-4",
    "PID-5",
    "PID-7",
    "PID-8",
    "PID-9",
    "PID-11",
    "PID-13",
    "PID-14",
    "PID-24",
    "PID-25",
    "PID-29",
    "PID-30",
  ],
};

const birthTimeUrl =
  "http://hl7.org/fhir/StructureDefinition/patient-birthTime";
const originalTextUrl = "http://hl7.org/fhir/StructureDefinition/originalText";

/** Maps a PID segment to a Patient. */
export function mapPatient(context: MappingContext, pid: SegmentAt): Patient {
  const all = <T>(
    fields: readonly number[],
    map: (context: MappingContext, source: Source) => T | undefined,
  ): T[] | undefined =>
    nonEmpty(
      fields
        .flatMap((n) => repetitions(pid, n))
        .map((source) => map(context, source))
        .filter((value) => value !== undefined),
    );
  const telecom = [
    ...telecoms(context, repetitions(pid, 13), "home"),
    ...telecoms(context, repetitions(pid, 14), "work"),
  ];
  return {
    resourceType: "Patient",
    ...compact({
      identifier: all([3, 2, 4], mapCx),
      name: all([5, 9], mapXpn),
      telecom: nonEmpty(telecom),
      ...gender(context, field(pid, 8)),
      ...birth(context, field(pid, 7)),
      ...deceased(context, pid),
      address: all([11], mapXad),
      ...multipleBirth(context, pid),
    }),
  };
}

/** The telecom of one field, each with the use of the field when XTN.2 gives none. */
function telecoms(
  context: MappingContext,
  sources: readonly Source[],
  use: NonNullable<ContactPoint["use"]>,
): ContactPoint[] {
  return sources
    .map((source) => mapXtn(context, source))
    .filter((telecom) => telecom !== undefined)
    .map((telecom) =>
      telecom.use === undefined ? { ...telecom, use } : telecom,
    );
}

/** The gender of PID-8, with the code as sent where the FHIR code stands for several (see the module comment). */
function gender(
  context: MappingContext,
  source: Source | undefined,
): Pick<Patient, "gender" | "_gender"> {
  const mapped = mapCode(context, source, administrativeGender);
  if (mapped === undefined) return {};
  const code = text(context, source);
  if (code === undefined || codesOf(mapped) <= 1) return { gender: mapped };
  const original: Extension = { url: originalTextUrl, valueString: code };
  return { gender: mapped, _gender: { extension: [original] } };
}

function codesOf(gender: AdministrativeGender): number {
  return [...administrativeGenderMap.values()].filter(
    (mapped) => mapped === gender,
  ).length;
}

/** The birth date of PID-7 and, when it has a time of day, the time of birth as the guide's extension. */
function birth(
  context: MappingContext,
  source: Source | undefined,
): Pick<Patient, "birthDate" | "_birthDate"> {
  const dateTime = mapTs(context, source);
  if (dateTime === undefined) return {};
  const [birthDate = dateTime, time] = dateTime.split("T");
  if (time === undefined) return { birthDate };
  const birthTime: Extension = { url: birthTimeUrl, valueDateTime: dateTime };
  return { birthDate, _birthDate: { extension: [birthTime] } };
}

/** The death date and time of PID-29, else the death indicator of PID-30. */
function deceased(
  context: MappingContext,
  pid: SegmentAt,
): Pick<Patient, "deceasedDateTime" | "deceasedBoolean"> {
  const dateTime = mapTs(context, field(pid, 29));
  if (dateTime !== undefined) return { deceasedDateTime: dateTime };
  const indicator = mapYesNo(context, field(pid, 30));
  return indicator === undefined ? {} : { deceasedBoolean: indicator };
}

/** The birth order of PID-25, else the multiple birth indicator of PID-24. */
function multipleBirth(
  context: MappingContext,
  pid: SegmentAt,
): Pick<Patient, "multipleBirthInteger" | "multipleBirthBoolean"> {
  const order = mapNm(context, field(pid, 25))?.value;
  if (order !== undefined && Number.isInteger(order)) {
    return { multipleBirthInteger: order };
  }
  const indicator = mapYesNo(context, field(pid, 24));
  return indicator === undefined ? {} : { multipleBirthBoolean: indicator };
}
