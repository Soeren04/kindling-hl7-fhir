---
---

Add the foundation of the FHIR mapping: the coding system URIs and the HL7 v2 to FHIR concept maps (administrative
sex, patient class, result status, name, address and telecom use), and the mappers of the HL7 v2 data types (CX, HD,
EI, XPN, XAD, XTN, CWE and CE, TS and DTM, DT, TM, DR, NM, SN, XCN, PL and ED) with the issue codes they report. They
are internal and not yet exported; `@types/fhir` is now a dependency, as the public declarations will name FHIR R4
types. Empty changeset: 1.0.0 is the first release and its changelog entry is written by hand.
