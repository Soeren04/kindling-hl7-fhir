// PV1, the patient visit segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ PV1[Encounter] - PV1.csv" and the other PV1 maps; data types, optionality and table numbers
// are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - PV1-53 and PV1-54 do not exist in 2.5.1 (added in 2.7); the segment ends at PV1-52.
// - Coded fields are IS (patient class, admission type and most others) or CE (diet type); the guide has CWE.
//   PV1-39 is IS in 2.5.1 and CWE in the guide.
// - Dates are TS (the guide has DTM); PV1-20 is FC and PV1-37 is DLD in both.
// - PV1-40 and PV1-52 are backward-compatibility fields (B) in 2.5.1.
// - PV1-3 and PV1-19 are conditional in some message structures and optional here.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The patient visit segment. */
export const pv1: SegmentDefinition = {
  id: "PV1",
  fields: [
    field(1, "setId", "SI"),
    field(2, "patientClass", "IS", "R", { table: "0004" }),
    field(3, "assignedPatientLocation", "PL"),
    field(4, "admissionType", "IS", "O", { table: "0007" }),
    field(5, "preadmitNumber", "CX"),
    field(6, "priorPatientLocation", "PL"),
    field(7, "attendingDoctor", "XCN", "O", { repeats: true, table: "0010" }),
    field(8, "referringDoctor", "XCN", "O", { repeats: true, table: "0010" }),
    field(9, "consultingDoctor", "XCN", "O", { repeats: true, table: "0010" }),
    field(10, "hospitalService", "IS", "O", { table: "0069" }),
    field(11, "temporaryLocation", "PL"),
    field(12, "preadmitTestIndicator", "IS", "O", { table: "0087" }),
    field(13, "readmissionIndicator", "IS", "O", { table: "0092" }),
    field(14, "admitSource", "IS", "O", { table: "0023" }),
    field(15, "ambulatoryStatus", "IS", "O", { repeats: true, table: "0009" }),
    field(16, "vipIndicator", "IS", "O", { table: "0099" }),
    field(17, "admittingDoctor", "XCN", "O", { repeats: true, table: "0010" }),
    field(18, "patientType", "IS", "O", { table: "0018" }),
    field(19, "visitNumber", "CX"),
    field(20, "financialClass", "FC", "O", { repeats: true, table: "0064" }),
    field(21, "chargePriceIndicator", "IS", "O", { table: "0032" }),
    field(22, "courtesyCode", "IS", "O", { table: "0045" }),
    field(23, "creditRating", "IS", "O", { table: "0046" }),
    field(24, "contractCode", "IS", "O", { repeats: true, table: "0044" }),
    field(25, "contractEffectiveDate", "DT", "O", { repeats: true }),
    field(26, "contractAmount", "NM", "O", { repeats: true }),
    field(27, "contractPeriod", "NM", "O", { repeats: true }),
    field(28, "interestCode", "IS", "O", { table: "0073" }),
    field(29, "transferToBadDebtCode", "IS", "O", { table: "0110" }),
    field(30, "transferToBadDebtDate", "DT"),
    field(31, "badDebtAgencyCode", "IS", "O", { table: "0021" }),
    field(32, "badDebtTransferAmount", "NM"),
    field(33, "badDebtRecoveryAmount", "NM"),
    field(34, "deleteAccountIndicator", "IS", "O", { table: "0111" }),
    field(35, "deleteAccountDate", "DT"),
    field(36, "dischargeDisposition", "IS", "O", { table: "0112" }),
    field(37, "dischargedToLocation", "DLD", "O", { table: "0113" }),
    field(38, "dietType", "CE", "O", { table: "0114" }),
    field(39, "servicingFacility", "IS", "O", { table: "0115" }),
    field(40, "bedStatus", "IS", "B", { table: "0116" }),
    field(41, "accountStatus", "IS", "O", { table: "0117" }),
    field(42, "pendingLocation", "PL"),
    field(43, "priorTemporaryLocation", "PL"),
    field(44, "admitDateTime", "TS"),
    field(45, "dischargeDateTime", "TS", "O", { repeats: true }),
    field(46, "currentPatientBalance", "NM"),
    field(47, "totalCharges", "NM"),
    field(48, "totalAdjustments", "NM"),
    field(49, "totalPayments", "NM"),
    field(50, "alternateVisitId", "CX"),
    field(51, "visitIndicator", "IS", "O", { table: "0326" }),
    field(52, "otherHealthcareProvider", "XCN", "B", {
      repeats: true,
      table: "0010",
    }),
  ],
};
