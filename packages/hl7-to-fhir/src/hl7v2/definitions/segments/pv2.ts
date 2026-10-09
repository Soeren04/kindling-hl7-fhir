// PV2, the patient visit additional information segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ PV2[Encounter] - PV2.csv"; data types, optionality and table numbers are the HL7 v2.5.1
// values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - PV2-50 does not exist in 2.5.1 (added after it); the segment ends at PV2-49.
// - Coded fields are IS or CE; the guide has CWE for all of them. Dates are TS (the guide has DTM).
// - PV2-1 and PV2-47 are conditional in 2.5.1; the guide makes them optional.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The patient visit additional information segment. */
export const pv2: SegmentDefinition = {
  id: "PV2",
  fields: [
    field(1, "priorPendingLocation", "PL", "C"),
    field(2, "accommodationCode", "CE", "O", { table: "0129" }),
    field(3, "admitReason", "CE"),
    field(4, "transferReason", "CE"),
    field(5, "patientValuables", "ST", "O", { repeats: true }),
    field(6, "patientValuablesLocation", "ST"),
    field(7, "visitUserCode", "IS", "O", { repeats: true, table: "0130" }),
    field(8, "expectedAdmitDateTime", "TS"),
    field(9, "expectedDischargeDateTime", "TS"),
    field(10, "estimatedLengthOfInpatientStay", "NM"),
    field(11, "actualLengthOfInpatientStay", "NM"),
    field(12, "visitDescription", "ST"),
    field(13, "referralSourceCode", "XCN", "O", { repeats: true }),
    field(14, "previousServiceDate", "DT"),
    field(15, "employmentIllnessRelatedIndicator", "ID", "O", {
      table: "0136",
    }),
    field(16, "purgeStatusCode", "IS", "O", { table: "0213" }),
    field(17, "purgeStatusDate", "DT"),
    field(18, "specialProgramCode", "IS", "O", { table: "0214" }),
    field(19, "retentionIndicator", "ID", "O", { table: "0136" }),
    field(20, "expectedNumberOfInsurancePlans", "NM"),
    field(21, "visitPublicityCode", "IS", "O", { table: "0215" }),
    field(22, "visitProtectionIndicator", "ID", "O", { table: "0136" }),
    field(23, "clinicOrganizationName", "XON", "O", { repeats: true }),
    field(24, "patientStatusCode", "IS", "O", { table: "0216" }),
    field(25, "visitPriorityCode", "IS", "O", { table: "0217" }),
    field(26, "previousTreatmentDate", "DT"),
    field(27, "expectedDischargeDisposition", "IS", "O", { table: "0112" }),
    field(28, "signatureOnFileDate", "DT"),
    field(29, "firstSimilarIllnessDate", "DT"),
    field(30, "patientChargeAdjustmentCode", "CE", "O", { table: "0218" }),
    field(31, "recurringServiceCode", "IS", "O", { table: "0219" }),
    field(32, "billingMediaCode", "ID", "O", { table: "0136" }),
    field(33, "expectedSurgeryDateAndTime", "TS"),
    field(34, "militaryPartnershipCode", "ID", "O", { table: "0136" }),
    field(35, "militaryNonAvailabilityCode", "ID", "O", { table: "0136" }),
    field(36, "newbornBabyIndicator", "ID", "O", { table: "0136" }),
    field(37, "babyDetainedIndicator", "ID", "O", { table: "0136" }),
    field(38, "modeOfArrivalCode", "CE", "O", { table: "0430" }),
    field(39, "recreationalDrugUseCode", "CE", "O", {
      repeats: true,
      table: "0431",
    }),
    field(40, "admissionLevelOfCareCode", "CE", "O", { table: "0432" }),
    field(41, "precautionCode", "CE", "O", { repeats: true, table: "0433" }),
    field(42, "patientConditionCode", "CE", "O", { table: "0434" }),
    field(43, "livingWillCode", "IS", "O", { table: "0315" }),
    field(44, "organDonorCode", "IS", "O", { table: "0316" }),
    field(45, "advanceDirectiveCode", "CE", "O", {
      repeats: true,
      table: "0435",
    }),
    field(46, "patientStatusEffectiveDate", "DT"),
    field(47, "expectedLoaReturnDateTime", "TS", "C"),
    field(48, "expectedPreAdmissionTestingDateTime", "TS"),
    field(49, "notifyClergyCode", "IS", "O", { repeats: true, table: "0534" }),
  ],
};
