// PID, the patient identification segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ PID[Patient] - PID.csv" and the other PID maps; data types, optionality and table numbers
// are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - PID-40 does not exist in 2.5.1 (added in 2.7); the segment ends at PID-39.
// - Coded fields are CE (race, language, marital status, religion, ethnic group, citizenship, military status,
//   nationality, species, breed, production class) or IS (administrative sex, county code,
//   identity reliability); the guide has CWE for all of them. PID-39 is CWE in both.
// - Dates are TS (the guide has DTM). PID-20 is the DLN composite (the guide leaves it empty).
// - PID-2, PID-4, PID-12, PID-19 and PID-20 are backward-compatibility fields (B); PID-4 repeats. PID-9 is optional
//   (it became backward-compatible only in 2.7).
// - PID-38 occurs once (the guide allows two).

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The patient identification segment. */
export const pid: SegmentDefinition = {
  id: "PID",
  fields: [
    field(1, "setId", "SI"),
    field(2, "patientId", "CX", "B"),
    field(3, "patientIdentifierList", "CX", "R", { repeats: true }),
    field(4, "alternatePatientId", "CX", "B", { repeats: true }),
    field(5, "patientName", "XPN", "R", { repeats: true }),
    field(6, "mothersMaidenName", "XPN", "O", { repeats: true }),
    field(7, "dateTimeOfBirth", "TS"),
    field(8, "administrativeSex", "IS", "O", { table: "0001" }),
    field(9, "patientAlias", "XPN", "O", { repeats: true }),
    field(10, "race", "CE", "O", { repeats: true, table: "0005" }),
    field(11, "patientAddress", "XAD", "O", { repeats: true }),
    field(12, "countyCode", "IS", "B", { table: "0289" }),
    field(13, "phoneNumberHome", "XTN", "O", { repeats: true }),
    field(14, "phoneNumberBusiness", "XTN", "O", { repeats: true }),
    field(15, "primaryLanguage", "CE", "O", { table: "0296" }),
    field(16, "maritalStatus", "CE", "O", { table: "0002" }),
    field(17, "religion", "CE", "O", { table: "0006" }),
    field(18, "patientAccountNumber", "CX"),
    field(19, "ssnNumberPatient", "ST", "B"),
    field(20, "driversLicenseNumberPatient", "DLN", "B"),
    field(21, "mothersIdentifier", "CX", "O", { repeats: true }),
    field(22, "ethnicGroup", "CE", "O", { repeats: true, table: "0189" }),
    field(23, "birthPlace", "ST"),
    field(24, "multipleBirthIndicator", "ID", "O", { table: "0136" }),
    field(25, "birthOrder", "NM"),
    field(26, "citizenship", "CE", "O", { repeats: true, table: "0171" }),
    field(27, "veteransMilitaryStatus", "CE", "O", { table: "0172" }),
    field(28, "nationality", "CE", "O", { table: "0212" }),
    field(29, "patientDeathDateAndTime", "TS"),
    field(30, "patientDeathIndicator", "ID", "O", { table: "0136" }),
    field(31, "identityUnknownIndicator", "ID", "O", { table: "0136" }),
    field(32, "identityReliabilityCode", "IS", "O", {
      repeats: true,
      table: "0445",
    }),
    field(33, "lastUpdateDateTime", "TS"),
    field(34, "lastUpdateFacility", "HD"),
    field(35, "speciesCode", "CE", "O", { table: "0446" }),
    field(36, "breedCode", "CE", "O", { table: "0447" }),
    field(37, "strain", "ST"),
    field(38, "productionClassCode", "CE", "O", { table: "0429" }),
    field(39, "tribalCitizenship", "CWE", "O", {
      repeats: true,
      table: "0171",
    }),
  ],
};
