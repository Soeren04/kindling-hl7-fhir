// OBR (with the ORC before it) to DiagnosticReport, by the guide's map segment-obr-to-diagnosticreport.
//
// FHIR requires a status and a code:
// - The status is OBR-25 through the guide's ConceptMap of table 0123. A code without equivalent becomes `unknown`:
//   silently when the guide leaves it unmatched, else reported as UNMAPPED_CODE. An empty OBR-25 becomes `unknown` as
//   well (REQUIRED_ELEMENT_DEFAULTED); OBR-25 is conditional in v2, but a report without a status cannot say whether
//   its results are final.
// - The code is the universal service identifier (OBR-4); without one, an element with the data-absent-reason
//   `unknown` (REQUIRED_ELEMENT_DEFAULTED).
//
// The placer and filler order numbers (OBR-2, OBR-3) are identifiers typed PLAC and FILL; when OBR leaves them empty,
// those of the ORC of the same order (ORC-2, ORC-3) stand in, as the guide's conditions on OBR-2 and OBR-3 allow. The
// observation time is OBR-7, or the period from OBR-7 to OBR-8 when OBR-8 is sent (./effective.ts).
import type {
  Attachment,
  CodeableConcept,
  DiagnosticReport,
  Identifier,
} from "fhir/r4";

import { compact, nonEmpty } from "../compact";
import { mapCode } from "../datatypes/code";
import { type MappingContext, reportIssue, text } from "../context";
import { mapCwe } from "../datatypes/cwe";
import { mapTs } from "../datatypes/date-time";
import { mapEi } from "../datatypes/ei";
import type { MappingCitation } from "../mapping-guide";
import { v2TableSystem } from "../terminology/coding-systems";
import {
  diagnosticReportStatus,
  diagnosticReportStatusUnmatched,
} from "../terminology/concept-maps";
import { absentElement } from "./absent";
import { orderEffective } from "./effective";
import { field, fieldLocation, isValued, type SegmentAt } from "./segment";

/** The rows of the guide's map for OBR that the DiagnosticReport carries. */
export const diagnosticReportCitation: MappingCitation = {
  conceptMap: "segment-obr-to-diagnosticreport",
  rows: [
    "OBR-2",
    "OBR-3",
    "OBR-4",
    "OBR-7",
    "OBR-8",
    "OBR-22",
    "OBR-24",
    "OBR-25",
  ],
};

/** What a DiagnosticReport is mapped from besides its segments. */
export interface DiagnosticReportLinks {
  /** The fullUrl of the Patient, if there is one. */
  readonly subject: string | undefined;
  /** The fullUrl of the Encounter, if there is one. */
  readonly encounter: string | undefined;
  /** The fullUrls of the Observations of the order. */
  readonly results: readonly string[];
  /** The encapsulated data of the order's observations (OBX-2 `ED`). */
  readonly presentedForm: readonly Attachment[];
}

/** Maps an OBR segment, and the ORC of its order if there is one, to a DiagnosticReport. */
export function mapDiagnosticReport(
  context: MappingContext,
  obr: SegmentAt,
  orc: SegmentAt | undefined,
  { subject, encounter, results, presentedForm }: DiagnosticReportLinks,
): DiagnosticReport {
  const identifier = [
    orderNumber(context, obr, orc, 2, "PLAC"),
    orderNumber(context, obr, orc, 3, "FILL"),
  ].filter((found) => found !== undefined);
  const category = mapCwe(context, field(obr, 24), "0074");
  return {
    resourceType: "DiagnosticReport",
    ...compact({ identifier: nonEmpty(identifier) }),
    status: status(context, obr),
    ...compact({ category: category === undefined ? undefined : [category] }),
    code: reportCode(context, obr),
    ...compact({
      subject: subject === undefined ? undefined : { reference: subject },
      encounter: encounter === undefined ? undefined : { reference: encounter },
      ...orderEffective(context, obr),
      issued: mapTs(context, field(obr, 22), "instant"),
      result: nonEmpty(results.map((reference) => ({ reference }))),
      presentedForm: nonEmpty(presentedForm),
    }),
  };
}

/** The order number of OBR field `n`, else of the same ORC field, typed `type` (table 0203). */
function orderNumber(
  context: MappingContext,
  obr: SegmentAt,
  orc: SegmentAt | undefined,
  n: 2 | 3,
  type: "PLAC" | "FILL",
): Identifier | undefined {
  const fromObr = field(obr, n);
  const identifier = mapEi(
    context,
    isValued(fromObr) || orc === undefined ? fromObr : field(orc, n),
  );
  return identifier === undefined
    ? undefined
    : {
        type: { coding: [{ system: v2TableSystem("0203"), code: type }] },
        ...identifier,
      };
}

function status(
  context: MappingContext,
  obr: SegmentAt,
): DiagnosticReport["status"] {
  const source = field(obr, 25);
  if (text(context, source) === undefined) {
    reportIssue(context, "REQUIRED_ELEMENT_DEFAULTED", fieldLocation(obr, 25));
    return "unknown";
  }
  return (
    mapCode(context, source, diagnosticReportStatus, {
      unmatched: diagnosticReportStatusUnmatched,
    }) ?? "unknown"
  );
}

function reportCode(context: MappingContext, obr: SegmentAt): CodeableConcept {
  const code = mapCwe(context, field(obr, 4));
  if (code !== undefined) return code;
  reportIssue(context, "REQUIRED_ELEMENT_DEFAULTED", fieldLocation(obr, 4));
  return absentElement("unknown");
}
