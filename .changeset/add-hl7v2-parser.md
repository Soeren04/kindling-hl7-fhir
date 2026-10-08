---
---

Add the `hl7-to-fhir/hl7v2` entry point with `parse`, a lenient HL7 v2 parser that returns a readonly message tree
with exact character spans and reports everything it tolerated as issues. The main entry point exports the `Issue`,
`IssueCode`, `Location`, `Severity` and `Span` types. Empty changeset: 1.0.0 is the first release and its changelog
entry is written by hand.
