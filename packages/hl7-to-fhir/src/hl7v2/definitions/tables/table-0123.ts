// HL7 table 0123 (Result Status), hl7-defined.
//
// Source of record: HL7 Terminology (THO, CC0), https://github.com/HL7/UTG at commit
// 05d22fc29bccb5ca5e60e249ec153da4ad07af58, input/sourceOfTruth/v2/codeSystems/cs-v2-0123.xml (version 3.0.0); the
// table type comes from input/sourceOfTruth/v2/v2-tables.xml. Only the codes are recorded, never their definitions (ADR
// 0005).
//
// THO publishes the tables as of the current version of HL7 v2, not frozen at 2.5.1, so the set may hold codes
// that 2.5.1 does not define. A superset never rejects a code that 2.5.1 allows.

import type { CodeTable } from "../types";

/** HL7 table 0123, Result Status. */
export const table0123: CodeTable = {
  number: "0123",
  name: "Result Status",
  kind: "hl7-defined",
  codes: new Set([
    "O",
    "I",
    "S",
    "A",
    "P",
    "C",
    "R",
    "F",
    "X",
    "Y",
    "Z",
    "M",
    "N",
  ]),
};
