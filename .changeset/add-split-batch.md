---
---

Add `splitBatch` to `hl7-to-fhir/hl7v2`: it splits batch files (FHS, BHS, BTS, FTS), MLLP streams and concatenated
messages into single messages and reports dropped text, unterminated frames and wrong trailer counts as issues. Empty
changeset: 1.0.0 is the first release and its changelog entry is written by hand.
