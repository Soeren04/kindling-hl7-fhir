// ORU_R01, the abstract message syntax for unsolicited observation results (event R01), as of HL7 v2.5.1.
//
// Source: HL7 Version 2 to FHIR Implementation Guide 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d, mappings/messages/"HL7 Message - FHIR R4_ ORU_R01 - Sheet1.csv": segment
// order, grouping and cardinality, compared with the 2.5.1 sequence.
//
// Where 2.5.1 differs from the guide (v2.9):
// - The guide's UAC, PRT, ARV, TXA segments and its PATIENT_OBSERVATION, COMMON_ORDER, ORDER_DOCUMENT and
//   SPECIMEN_OBSERVATION groups do not exist in 2.5.1. ORC is an optional segment of ORDER_OBSERVATION, and SPECIMEN
//   holds SPM and its OBX segments directly.
// - Every other segment appears in the same order and with the same cardinality in both.

import { group, segment } from "../define";
import type { MessageStructureDefinition } from "../types";

/** The ORU_R01 message structure. */
export const oruR01: MessageStructureDefinition = {
  id: "ORU_R01",
  elements: [
    segment("MSH", "required"),
    segment("SFT", "optionalRepeating"),
    group("PATIENT_RESULT", "repeating", [
      group("PATIENT", "optional", [
        segment("PID", "required"),
        segment("PD1", "optional"),
        segment("NTE", "optionalRepeating"),
        segment("NK1", "optionalRepeating"),
        group("VISIT", "optional", [
          segment("PV1", "required"),
          segment("PV2", "optional"),
        ]),
      ]),
      group("ORDER_OBSERVATION", "repeating", [
        segment("ORC", "optional"),
        segment("OBR", "required"),
        segment("NTE", "optionalRepeating"),
        group("TIMING_QTY", "optionalRepeating", [
          segment("TQ1", "required"),
          segment("TQ2", "optionalRepeating"),
        ]),
        segment("CTD", "optional"),
        group("OBSERVATION", "optionalRepeating", [
          segment("OBX", "required"),
          segment("NTE", "optionalRepeating"),
        ]),
        segment("FT1", "optionalRepeating"),
        segment("CTI", "optionalRepeating"),
        group("SPECIMEN", "optionalRepeating", [
          segment("SPM", "required"),
          segment("OBX", "optionalRepeating"),
        ]),
      ]),
    ]),
    segment("DSC", "optional"),
  ],
};
