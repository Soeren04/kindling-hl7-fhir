// The clinically relevant time of an order's observations: OBR-7, the observation date and time, or the period from
// OBR-7 to OBR-8, the observation end date and time, when OBR-8 is sent. The DiagnosticReport of the order carries it,
// and so does each Observation of the order without a time of its own (OBX-14).
import type { Period } from "fhir/r4";

import type { MappingContext } from "../context";
import { mapTs } from "../datatypes/date-time";
import { field, type SegmentAt } from "./segment";

/** The effective time of a DiagnosticReport or an Observation: a point in time or a period, or neither. */
export interface Effective {
  readonly effectiveDateTime?: string;
  readonly effectivePeriod?: Period;
}

/** The time of the observations of the order of `obr`: OBR-7 alone, or the period from OBR-7 to OBR-8. */
export function orderEffective(
  context: MappingContext,
  obr: SegmentAt,
): Effective {
  const start = mapTs(context, field(obr, 7));
  const end = mapTs(context, field(obr, 8));
  if (end !== undefined) {
    return {
      effectivePeriod: start === undefined ? { end } : { start, end },
    };
  }
  return start === undefined ? {} : { effectiveDateTime: start };
}
