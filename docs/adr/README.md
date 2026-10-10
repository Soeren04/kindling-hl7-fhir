# Architecture decision records

Each record explains one decision that shapes the code: the context, the decision, the alternatives and the
consequences. New records copy [the template](0000-template.md) and take the next number; accepted records are not
rewritten, they are superseded.

| ADR                                                    | Decision                                              |
| ------------------------------------------------------ | ----------------------------------------------------- |
| [0001](0001-handwritten-parser.md)                     | Handwritten HL7 v2 parser                             |
| [0002](0002-single-package-with-tooling-boundaries.md) | One published package, boundaries enforced by tooling |
| [0003](0003-lenient-parse-strict-validate.md)          | Lenient parsing, strict validation                    |
| [0004](0004-result-and-issues.md)                      | `Result` for failures, `Issue` lists without PHI      |
| [0005](0005-hl7-content-licensing.md)                  | HL7 content licensing                                 |
| [0006](0006-tooling.md)                                | Build, lint and test tooling                          |
| [0007](0007-api-report-without-api-extractor.md)       | API report without API Extractor                      |
| [0008](0008-message-model-and-indexing.md)             | Message model and field indexing                      |
| [0009](0009-paths-and-their-types.md)                  | Paths and their types                                 |
| [0010](0010-public-result-and-failure-shapes.md)       | Public result and failure shapes                      |
| [0011](0011-structures-groups-and-validation.md)       | Message structures, segment groups and validation     |
| [0012](0012-mapping-source-and-fhir-types.md)          | Mapping source and FHIR types                         |
| [0013](0013-dates-and-times.md)                        | Dates and times                                       |
| [0014](0014-logical-references.md)                     | Practitioners and locations as logical references     |
| [0015](0015-null-semantics.md)                         | The explicit null in FHIR output                      |
| [0016](0016-numbers.md)                                | Numbers and their precision                           |
