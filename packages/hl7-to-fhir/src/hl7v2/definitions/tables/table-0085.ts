// HL7 table 0085 (Observation Result Status Codes Interpretation), hl7-defined.
//
// Source of record: HL7 Terminology (THO, CC0), https://github.com/HL7/UTG at commit
// 05d22fc29bccb5ca5e60e249ec153da4ad07af58, input/sourceOfTruth/v2/codeSystems/cs-v2-0085.xml (version 3.0.0); the
// table type comes from input/sourceOfTruth/v2/v2-tables.xml. Only the codes are recorded, never their definitions (ADR
// 0005).
//
// THO publishes the tables as of the current version of HL7 v2, not frozen at 2.5.1, so the set may hold codes
// that 2.5.1 does not define. A superset never rejects a code that 2.5.1 allows.

import type { CodeTable } from "../types";

/** HL7 table 0085, Observation Result Status Codes Interpretation. */
export const table0085: CodeTable = {
  number: "0085",
  name: "Observation Result Status Codes Interpretation",
  kind: "hl7-defined",
  codes: new Set([
    "A",
    "B",
    "C",
    "D",
    "F",
    "I",
    "N",
    "O",
    "P",
    "R",
    "S",
    "V",
    "X",
    "U",
    "W",
  ]),
};
