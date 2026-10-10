// The Patient of a PID and the Encounter of a PV1 (with its PV2), which both message structures start with.
import { mapEncounter } from "../resources/encounter";
import { mapPatient } from "../resources/patient";
import type { SegmentAt } from "../resources/segment";
import type { MappedEntry, MessageMapping } from "./mapping";

/** The segments of a patient and a visit, each of which may be missing in a malformed message. */
export interface VisitSegments {
  readonly pid: SegmentAt | undefined;
  readonly pv1: SegmentAt | undefined;
  readonly pv2: SegmentAt | undefined;
  /** The trigger event of an ADT message, which decides the status of the Encounter. */
  readonly event: string | undefined;
}

/** The Patient and the Encounter, as far as their segments are there. */
export interface MappedVisit {
  readonly entries: readonly MappedEntry[];
  readonly patient: string | undefined;
  readonly encounter: string | undefined;
}

/** Maps the PID to a Patient and the PV1 and PV2 to an Encounter of that Patient. */
export function mapVisit(
  mapping: MessageMapping,
  { pid, pv1, pv2, event }: VisitSegments,
): MappedVisit {
  const { context, nextUrl, markMapped } = mapping;
  const entries: MappedEntry[] = [];
  const patient = pid === undefined ? undefined : nextUrl(pid);
  if (pid !== undefined && patient !== undefined) {
    markMapped(pid);
    const resource = mapPatient(context, pid);
    entries.push({ fullUrl: patient, resource, source: pid });
  }
  const encounter = pv1 === undefined ? undefined : nextUrl(pv1);
  if (pv1 !== undefined && encounter !== undefined) {
    markMapped(pv1);
    if (pv2 !== undefined) markMapped(pv2);
    const resource = mapEncounter(context, pv1, pv2, {
      event,
      subject: patient,
    });
    entries.push({ fullUrl: encounter, resource, source: pv1 });
  }
  return { entries, patient, encounter };
}
