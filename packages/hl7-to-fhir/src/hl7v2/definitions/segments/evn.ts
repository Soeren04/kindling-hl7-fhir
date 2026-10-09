// EVN, the event type segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and data types follow mappings/segments/
// "HL7 Segment - FHIR R4_ EVN[Provenance] - Sheet1.csv"; optionality, repetition and table numbers are the HL7 v2.5.1
// values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - EVN-1 is kept only for backward compatibility (B) in 2.5.1.
// - Dates are TS, EVN-4 is IS with table 0062 (the guide has DTM and CWE).

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The event type segment. */
export const evn: SegmentDefinition = {
  id: "EVN",
  fields: [
    field(1, "eventTypeCode", "ID", "B", { table: "0003" }),
    field(2, "recordedDateTime", "TS", "R"),
    field(3, "dateTimePlannedEvent", "TS"),
    field(4, "eventReasonCode", "IS", "O", { table: "0062" }),
    field(5, "operatorId", "XCN", "O", { repeats: true, table: "0188" }),
    field(6, "eventOccurred", "TS"),
    field(7, "eventFacility", "HD"),
  ],
};
