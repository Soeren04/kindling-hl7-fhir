---
---

Add the conversion to FHIR R4: `convert` and `createConverter` turn ADT^A01 (A01, A04, A08, A13) and ORU^R01
messages into a `collection` or `transaction` Bundle of Patient, Encounter, Observation and DiagnosticReport resources,
mapped by the HL7 Version 2 to FHIR Implementation Guide 1.0.0, with the issues of parsing, validation and mapping.
Options add segment definitions, segment mappers, customizers per resource type, code and identifier systems, an id
generator (`sequentialIds` for repeatable bundles) and a time zone; a failing hook or invalid option is a
`ConvertFailure`, never an exception. Underneath are the coding system URIs, the HL7 v2 to FHIR concept maps and the
mappers of the HL7 v2 data types (CX, HD, EI, XPN, XAD, XTN, CWE and CE, TS and DTM, DT, TM, DR, NM, SN, XCN, PL and
ED). `@types/fhir` is a dependency, as the public declarations name FHIR R4 types. Empty changeset: 1.0.0 is the first
release and its changelog entry is written by hand.
