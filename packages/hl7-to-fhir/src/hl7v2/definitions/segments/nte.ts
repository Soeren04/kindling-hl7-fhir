// NTE, the notes and comments segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ NTE[Observation] - Sheet1.csv" and the other NTE maps; data types, optionality and table
// numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - NTE-5 to NTE-9 do not exist in 2.5.1 (added in 2.7 and later); the segment ends at NTE-4.
// - NTE-4 is CE (the guide has CWE).

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The notes and comments segment. */
export const nte: SegmentDefinition = {
  id: "NTE",
  fields: [
    field(1, "setId", "SI"),
    field(2, "sourceOfComment", "ID", "O", { table: "0105" }),
    field(3, "comment", "FT", "O", { repeats: true }),
    field(4, "commentType", "CE", "O", { table: "0364" }),
  ],
};
