# Sample messages

**All data in these messages is fictional.** The patients use the HL7 standard's fictional names (`Everyman`,
`Everywoman`), and identifiers, addresses and phone numbers are obviously fake (`PATID1234`, `999-99-9999`,
`555-5552004`). They contain no real patient data and must stay that way; see
[Synthetic data only](../CONTRIBUTING.md#synthetic-data-only).

Segments end with a carriage return, as HL7 v2 requires. The files are stored byte for byte (`*.hl7 -text` in
`.gitattributes`), so editors and Git do not convert the terminators.

| File                    | Message                              | What it exercises                                                                                                 |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `adt-a01.hl7`           | ADT^A01, v2.5.1, UTF-8               | Repetitions, subcomponents, the HL7 null `""`, delimiter and hexadecimal escapes, a Z segment with a local escape |
| `oru-r01.hl7`           | ORU^R01, v2.5.1                      | Two OBR groups with OBX and NTE segments, line breaks and highlighting in text                                    |
| `custom-delimiters.hl7` | ADT^A04, v2.8.2, `#$*!%` and `?`     | Non-standard delimiters, including a truncation character that marks a truncated value and one escaped as `!P!`   |
| `batch.hl7`             | FHS, two BHS batches, three messages | A batch file for `splitBatch`: file and batch envelopes with correct counts                                       |

`batch.hl7` is not one message: `splitBatch` cuts it into three, which parse like the others. The parse trees of the single messages are checked in `packages/hl7-to-fhir/test/golden/`.
