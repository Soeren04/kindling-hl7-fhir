// OBR, the observation request segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ OBR[DiagnosticReport] - OBR.csv" and the other OBR maps; data types, optionality and table
// numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - OBR-51 to OBR-54 do not exist in 2.5.1 (added in 2.7); the segment ends at OBR-50.
// - Coded fields are CE (the guide has CWE), except OBR-48, which is CWE in both. OBR-13 is plain text (ST) in
//   2.5.1. Dates are TS (the guide has DTM). OBR-15 is SPS in both.
// - OBR-5, OBR-6, OBR-15 and OBR-27 are kept only for backward compatibility (B).
// - OBR-2, OBR-3, OBR-7, OBR-14, OBR-22 and OBR-25 are conditional in 2.5.1; the guide makes them optional.
// - OBR-17 allows two phone numbers.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The observation request segment. */
export const obr: SegmentDefinition = {
  id: "OBR",
  fields: [
    field(1, "setId", "SI"),
    field(2, "placerOrderNumber", "EI", "C"),
    field(3, "fillerOrderNumber", "EI", "C"),
    field(4, "universalServiceIdentifier", "CE", "R"),
    field(5, "priority", "ID", "B"),
    field(6, "requestedDateTime", "TS", "B"),
    field(7, "observationDateTime", "TS", "C"),
    field(8, "observationEndDateTime", "TS"),
    field(9, "collectionVolume", "CQ"),
    field(10, "collectorIdentifier", "XCN", "O", { repeats: true }),
    field(11, "specimenActionCode", "ID", "O", { table: "0065" }),
    field(12, "dangerCode", "CE"),
    field(13, "relevantClinicalInformation", "ST"),
    field(14, "specimenReceivedDateTime", "TS", "C"),
    field(15, "specimenSource", "SPS", "B"),
    field(16, "orderingProvider", "XCN", "O", { repeats: true }),
    field(17, "orderCallbackPhoneNumber", "XTN", "O", { repeats: 2 }),
    field(18, "placerField1", "ST"),
    field(19, "placerField2", "ST"),
    field(20, "fillerField1", "ST"),
    field(21, "fillerField2", "ST"),
    field(22, "resultsRptStatusChngDateTime", "TS", "C"),
    field(23, "chargeToPractice", "MOC"),
    field(24, "diagnosticServSectId", "ID", "O", { table: "0074" }),
    field(25, "resultStatus", "ID", "C", { table: "0123" }),
    field(26, "parentResult", "PRL"),
    field(27, "quantityTiming", "TQ", "B", { repeats: true }),
    field(28, "resultCopiesTo", "XCN", "O", { repeats: true }),
    field(29, "parent", "EIP"),
    field(30, "transportationMode", "ID", "O", { table: "0124" }),
    field(31, "reasonForStudy", "CE", "O", { repeats: true }),
    field(32, "principalResultInterpreter", "NDL"),
    field(33, "assistantResultInterpreter", "NDL", "O", { repeats: true }),
    field(34, "technician", "NDL", "O", { repeats: true }),
    field(35, "transcriptionist", "NDL", "O", { repeats: true }),
    field(36, "scheduledDateTime", "TS"),
    field(37, "numberOfSampleContainers", "NM"),
    field(38, "transportLogisticsOfCollectedSample", "CE", "O", {
      repeats: true,
    }),
    field(39, "collectorsComment", "CE", "O", { repeats: true }),
    field(40, "transportArrangementResponsibility", "CE"),
    field(41, "transportArranged", "ID", "O", { table: "0224" }),
    field(42, "escortRequired", "ID", "O", { table: "0225" }),
    field(43, "plannedPatientTransportComment", "CE", "O", { repeats: true }),
    field(44, "procedureCode", "CE", "O", { table: "0088" }),
    field(45, "procedureCodeModifier", "CE", "O", {
      repeats: true,
      table: "0340",
    }),
    field(46, "placerSupplementalServiceInformation", "CE", "O", {
      repeats: true,
      table: "0411",
    }),
    field(47, "fillerSupplementalServiceInformation", "CE", "O", {
      repeats: true,
      table: "0411",
    }),
    field(48, "medicallyNecessaryDuplicateProcedureReason", "CWE", "O", {
      table: "0476",
    }),
    field(49, "resultHandling", "IS", "O", { table: "0507" }),
    field(50, "parentUniversalServiceIdentifier", "CWE"),
  ],
};
