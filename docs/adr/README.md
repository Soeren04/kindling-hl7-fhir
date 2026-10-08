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
