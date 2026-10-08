# hl7-to-fhir

[![CI](https://github.com/Soeren04/kindling-hl7-fhir/actions/workflows/ci.yml/badge.svg)](https://github.com/Soeren04/kindling-hl7-fhir/actions/workflows/ci.yml)

A TypeScript library, in development, for converting HL7 v2 messages to FHIR R4. The goals are zero runtime
dependencies, full typing, and one codebase that runs in the browser and in Node.

**Status:** first release in preparation; nothing is published to npm yet and the public API is not final. The
baseline is HL7 v2.5.1 and FHIR R4 (4.0.1).

## Design

The decisions behind the library and its tooling are written down as
[architecture decision records](https://github.com/Soeren04/kindling-hl7-fhir/tree/main/docs/adr), including which
parts are already implemented.

## Contributing

Contributions are welcome: read
[CONTRIBUTING.md](https://github.com/Soeren04/kindling-hl7-fhir/blob/main/CONTRIBUTING.md) for the setup and the
quality gates, and the
[Code of Conduct](https://github.com/Soeren04/kindling-hl7-fhir/blob/main/CODE_OF_CONDUCT.md). Issues, tests and
samples only ever contain synthetic or fully de-identified messages. Report vulnerabilities privately as described in
[SECURITY.md](https://github.com/Soeren04/kindling-hl7-fhir/blob/main/SECURITY.md).

## License

[MIT](https://github.com/Soeren04/kindling-hl7-fhir/blob/main/LICENSE). HL7® and FHIR® are registered trademarks of
Health Level Seven International; see [NOTICE](https://github.com/Soeren04/kindling-hl7-fhir/blob/main/NOTICE) for the
HL7 attribution and what HL7 content this project contains.
