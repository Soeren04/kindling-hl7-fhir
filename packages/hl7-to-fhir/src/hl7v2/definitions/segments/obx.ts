// OBX, the observation result segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ OBX[Observation] - OBX.csv" and the other OBX maps; data types, optionality and table
// numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - OBX-20 to OBX-22 are reserved positions in 2.5.1 (optionality X); the guide's observation site, instance
//   identifier and mood code arrived in later versions. OBX-26 to OBX-33 do not exist; the segment ends at OBX-25.
// - OBX-4 is ST (the guide has OG), OBX-6, OBX-15, OBX-17 are CE (the guide has CWE), dates are TS (the guide has
//   DTM). OBX-8 is named abnormal flags in 2.5.1 (interpretation codes in the guide) and is IS.
// - OBX-2, OBX-4 and OBX-5 are conditional in 2.5.1; the guide makes them optional. OBX-5 repeats.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** OBX-2, the value type: the data type of OBX-5. */
export const valueTypeField = 2;

/** OBX-5, the observation value, whose data type OBX-2 names. */
export const observationValueField = 5;

/** The observation result segment. */
export const obx: SegmentDefinition = {
  id: "OBX",
  fields: [
    field(1, "setId", "SI"),
    field(valueTypeField, "valueType", "ID", "C", { table: "0125" }),
    field(3, "observationIdentifier", "CE", "R"),
    field(4, "observationSubId", "ST", "C"),
    field(observationValueField, "observationValue", "varies", "C", {
      repeats: true,
    }),
    field(6, "units", "CE"),
    field(7, "referencesRange", "ST"),
    field(8, "abnormalFlags", "IS", "O", { repeats: true, table: "0078" }),
    field(9, "probability", "NM"),
    field(10, "natureOfAbnormalTest", "ID", "O", {
      repeats: true,
      table: "0080",
    }),
    field(11, "observationResultStatus", "ID", "R", { table: "0085" }),
    field(12, "effectiveDateOfReferenceRange", "TS"),
    field(13, "userDefinedAccessChecks", "ST"),
    field(14, "dateTimeOfTheObservation", "TS"),
    field(15, "producersId", "CE"),
    field(16, "responsibleObserver", "XCN", "O", { repeats: true }),
    field(17, "observationMethod", "CE", "O", { repeats: true }),
    field(18, "equipmentInstanceIdentifier", "EI", "O", { repeats: true }),
    field(19, "dateTimeOfTheAnalysis", "TS"),
    field(20, "reserved20", "ST", "X"),
    field(21, "reserved21", "ST", "X"),
    field(22, "reserved22", "ST", "X"),
    field(23, "performingOrganizationName", "XON"),
    field(24, "performingOrganizationAddress", "XAD"),
    field(25, "performingOrganizationMedicalDirector", "XCN"),
  ],
};
