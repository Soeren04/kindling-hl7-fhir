// ADT_A01, the abstract message syntax for admit/visit notifications (events A01, A04, A08 and A13), as of HL7 v2.5.1.
//
// Source: HL7 Version 2 to FHIR Implementation Guide 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d, mappings/messages/"HL7 Message - FHIR R4_ ADT_A01 - Sheet1.csv": segment
// order, grouping and cardinality, compared with the 2.5.1 sequence.
//
// Where 2.5.1 differs from the guide (v2.9):
// - The guide's ARV, UAC, OH1 to OH4, PRT, IAM, AUT and RF1 segments, and its NEXT_OF_KIN, OBSERVATION,
//   AUTHORIZATION and REFERRAL groups, do not exist in 2.5.1. NK1 and OBX are plain repeating segments here, and
//   INSURANCE holds IN1, IN2, IN3 and ROL only.
// - Every other segment appears in the same order and with the same cardinality in both.

import { group, segment } from "../define";
import type { MessageStructureDefinition } from "../types";

/** The ADT_A01 message structure. */
export const adtA01: MessageStructureDefinition = {
  id: "ADT_A01",
  elements: [
    segment("MSH", "required"),
    segment("SFT", "optionalRepeating"),
    segment("EVN", "required"),
    segment("PID", "required"),
    segment("PD1", "optional"),
    segment("ROL", "optionalRepeating"),
    segment("NK1", "optionalRepeating"),
    segment("PV1", "required"),
    segment("PV2", "optional"),
    segment("ROL", "optionalRepeating"),
    segment("DB1", "optionalRepeating"),
    segment("OBX", "optionalRepeating"),
    segment("AL1", "optionalRepeating"),
    segment("DG1", "optionalRepeating"),
    segment("DRG", "optional"),
    group("PROCEDURE", "optionalRepeating", [
      segment("PR1", "required"),
      segment("ROL", "optionalRepeating"),
    ]),
    segment("GT1", "optionalRepeating"),
    group("INSURANCE", "optionalRepeating", [
      segment("IN1", "required"),
      segment("IN2", "optional"),
      segment("IN3", "optionalRepeating"),
      segment("ROL", "optionalRepeating"),
    ]),
    segment("ACC", "optional"),
    segment("UB1", "optional"),
    segment("UB2", "optional"),
    segment("PDA", "optional"),
  ],
};
