---
---

Add `validate`, `group` and `defineSegment` to `hl7-to-fhir/hl7v2`: `validate` checks a message against HL7 v2.5.1
(segment order and cardinality of ADT_A01 and ORU_R01, required fields, repetitions, components, formats of numbers,
dates, times and codes, and codes of the shipped tables) and reports every finding as an issue with a stable code;
`group` arranges the segments in the groups of their message structure; `defineSegment` defines Z segments for both.
Empty changeset: 1.0.0 is the first release and its changelog entry is written by hand.
