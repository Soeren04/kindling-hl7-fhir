// HL7 table 0104 (Version ID), hl7-defined.
//
// Source of record: HL7 Terminology (THO, CC0), https://github.com/HL7/UTG at commit
// 05d22fc29bccb5ca5e60e249ec153da4ad07af58, input/sourceOfTruth/v2/codeSystems/cs-v2-0104.xml (version 3.0.0); the
// table type comes from input/sourceOfTruth/v2/v2-tables.xml. Only the codes are recorded, never their definitions (ADR
// 0005).
//
// THO publishes the tables as of the current version of HL7 v2, not frozen at 2.5.1, so the set may hold codes
// that 2.5.1 does not define. A superset never rejects a code that 2.5.1 allows.

import type { CodeTable } from "../types";

/** HL7 table 0104, Version ID. */
export const table0104: CodeTable = {
  number: "0104",
  name: "Version ID",
  kind: "hl7-defined",
  codes: new Set([
    "2.0",
    "2.0D",
    "2.1",
    "2.2",
    "2.3",
    "2.3.1",
    "2.3.2",
    "2.4",
    "2.5",
    "2.5.1",
    "2.6",
    "2.7",
    "2.7.1",
    "2.8",
    "2.8.1",
    "2.8.2",
    "2.9",
  ]),
};
