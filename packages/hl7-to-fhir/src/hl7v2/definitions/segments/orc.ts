// ORC, the common order segment, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and cardinality follow mappings/segments/
// "HL7 Segment - FHIR R4_ ORC[ServiceRequest] - ORC.csv" and the other ORC maps; data types, optionality and table
// numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - ORC-32 to ORC-38 do not exist in 2.5.1 (added in 2.6 and later); the segment ends at ORC-31.
// - ORC-4 is EI in 2.5.1 (the guide has EIP). Dates are TS, and ORC-16 to ORC-18 and ORC-20 are CE (the guide has
//   CWE); ORC-25, ORC-26, ORC-28, ORC-29 and ORC-31 are CWE and ORC-30 is CNE in both.
// - ORC-7 is kept only for backward compatibility (B). ORC-14 allows two phone numbers.
// - ORC-2 and ORC-3 are conditional in 2.5.1; the guide makes them optional.

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The common order segment. */
export const orc: SegmentDefinition = {
  id: "ORC",
  fields: [
    field(1, "orderControl", "ID", "R", { table: "0119" }),
    field(2, "placerOrderNumber", "EI", "C"),
    field(3, "fillerOrderNumber", "EI", "C"),
    field(4, "placerGroupNumber", "EI"),
    field(5, "orderStatus", "ID", "O", { table: "0038" }),
    field(6, "responseFlag", "ID", "O", { table: "0121" }),
    field(7, "quantityTiming", "TQ", "B", { repeats: true }),
    field(8, "parent", "EIP"),
    field(9, "dateTimeOfTransaction", "TS"),
    field(10, "enteredBy", "XCN", "O", { repeats: true }),
    field(11, "verifiedBy", "XCN", "O", { repeats: true }),
    field(12, "orderingProvider", "XCN", "O", { repeats: true }),
    field(13, "entererLocation", "PL"),
    field(14, "callBackPhoneNumber", "XTN", "O", { repeats: 2 }),
    field(15, "orderEffectiveDateTime", "TS"),
    field(16, "orderControlCodeReason", "CE"),
    field(17, "enteringOrganization", "CE"),
    field(18, "enteringDevice", "CE"),
    field(19, "actionBy", "XCN", "O", { repeats: true }),
    field(20, "advancedBeneficiaryNoticeCode", "CE", "O", { table: "0339" }),
    field(21, "orderingFacilityName", "XON", "O", { repeats: true }),
    field(22, "orderingFacilityAddress", "XAD", "O", { repeats: true }),
    field(23, "orderingFacilityPhoneNumber", "XTN", "O", { repeats: true }),
    field(24, "orderingProviderAddress", "XAD", "O", { repeats: true }),
    field(25, "orderStatusModifier", "CWE"),
    field(26, "advancedBeneficiaryNoticeOverrideReason", "CWE", "O", {
      table: "0552",
    }),
    field(27, "fillersExpectedAvailabilityDateTime", "TS"),
    field(28, "confidentialityCode", "CWE", "O", { table: "0177" }),
    field(29, "orderType", "CWE", "O", { table: "0482" }),
    field(30, "entererAuthorizationMode", "CNE", "O", { table: "0483" }),
    field(31, "parentUniversalServiceIdentifier", "CWE"),
  ],
};
