// PD1, the additional demographics segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ PD1[Patient] - PD1.csv" and "... PD1[Observation-LivingWill] - PD1.csv"; data types,
// optionality and table numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - PD1-22 does not exist in 2.5.1 (added after it); the segment ends at PD1-21.
// - Coded fields are IS (living dependency and arrangement, student indicator, handicap, living will, organ donor,
//   military branch, rank and status, immunization registry status) or CE (publicity code, advance directive code);
//   the guide has CWE for all of them.
// - The guide leaves the minimum of PD1-6 empty; it is optional here.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The additional demographics segment. */
export const pd1: SegmentDefinition = {
  id: "PD1",
  fields: [
    field(1, "livingDependency", "IS", "O", { repeats: true, table: "0223" }),
    field(2, "livingArrangement", "IS", "O", { table: "0220" }),
    field(3, "patientPrimaryFacility", "XON", "O", { repeats: true }),
    field(4, "patientPrimaryCareProviderNameAndIdNo", "XCN", "O", {
      repeats: true,
    }),
    field(5, "studentIndicator", "IS", "O", { table: "0231" }),
    field(6, "handicap", "IS", "O", { table: "0295" }),
    field(7, "livingWillCode", "IS", "O", { table: "0315" }),
    field(8, "organDonorCode", "IS", "O", { table: "0316" }),
    field(9, "separateBill", "ID", "O", { table: "0136" }),
    field(10, "duplicatePatient", "CX", "O", { repeats: true }),
    field(11, "publicityCode", "CE", "O", { table: "0215" }),
    field(12, "protectionIndicator", "ID", "O", { table: "0136" }),
    field(13, "protectionIndicatorEffectiveDate", "DT"),
    field(14, "placeOfWorship", "XON", "O", { repeats: true }),
    field(15, "advanceDirectiveCode", "CE", "O", {
      repeats: true,
      table: "0435",
    }),
    field(16, "immunizationRegistryStatus", "IS", "O", { table: "0441" }),
    field(17, "immunizationRegistryStatusEffectiveDate", "DT"),
    field(18, "publicityCodeEffectiveDate", "DT"),
    field(19, "militaryBranch", "IS", "O", { table: "0140" }),
    field(20, "militaryRankGrade", "IS", "O", { table: "0141" }),
    field(21, "militaryStatus", "IS", "O", { table: "0142" }),
  ],
};
