# 0005. HL7 content licensing

- Status: accepted
- Date: 2026-10-08

## Context

Parsing, validating and mapping HL7 v2 needs metadata from the standard: segment and field identifiers and names,
data types, optionality and cardinality, message structures, and table codes. HL7 International owns the HL7 v2
standard, and this project is MIT licensed. We need to know what may be redistributed in an open source package.

Findings (checked 2026-10-08; hl7.org itself was not reachable from the build environment, so the terms were checked
through the license statements HL7 publishes with its documents, IGs and packages):

- **HL7 v2 standard documents** are free of charge but licensed under the HL7 IP policy. The license text in HL7
  publications lets non-members "read and use the Specified Material for evaluating whether to implement, or in
  implementing, the Specified Material, and to use Specified Material to develop and sell products and services that
  implement, but do not directly incorporate, the Specified Material in whole or in part". Incorporating further
  material into products requires an HL7 organizational membership.
- **HL7 Terminology (THO)**, <https://terminology.hl7.org/>, which publishes the HL7 v2 tables as code systems (for
  example `http://terminology.hl7.org/CodeSystem/v2-0203`), is released under **CC0**: "THO is copyright ©1989+
  Health Level Seven International and is made available under the CC0 designation". HL7 asks that altered versions
  are identified as derivative works.
- **HL7 Version 2 to FHIR Implementation Guide** 1.0.0 (STU 1), <https://hl7.org/fhir/uv/v2mappings/>, declares
  `CC0-1.0` in its package metadata. Its segment, data type and vocabulary maps list the v2 fields with their
  identifiers, names, data types and cardinalities.
- **FHIR R4** is dedicated to the public domain under **CC0**. HL7®, HEALTH LEVEL SEVEN® and FHIR® are registered
  trademarks of Health Level Seven International; CC0 does not cover the trademarks.
- Third-party terminologies referenced by HL7 (LOINC, SNOMED CT, UCUM) have their own licenses.

## Decision

- Ship only the HL7 v2 metadata the code needs: identifiers, short names, data types, optionality, cardinality,
  message structures and table codes, for the segments, structures and tables we map or validate.
- Take that metadata from the CC0 sources (THO for tables and codes, the v2-to-FHIR IG for segment and field
  structure, FHIR R4 for FHIR definitions), and record the source of each data file in the file itself.
- Never copy text from the HL7 v2 standard documents (definitions, descriptions, usage notes) into code, data or
  documentation; documentation links to the standard instead.
- Attribute HL7 and the CC0 sources, state the trademarks and the derivative-work status of the THO subset in
  `NOTICE`, which ships in the npm package next to `LICENSE`.
- Reference external terminologies only by their system URI and codes that appear in mappings; ship none of their
  content.

## Alternatives considered

- **Generate complete dictionaries from the HL7 v2 database or standard documents.** Comprehensive, but that is
  direct incorporation of Specified Material and would need an HL7 organizational membership, which cannot be
  passed on to an MIT-licensed package's users.
- **Ship no metadata and validate nothing.** Avoids the question but removes validation and readable diagnostics.

## Consequences

- The package is safe to redistribute under MIT, with HL7 attribution in `NOTICE`.
- Adding a segment or table means sourcing it from THO or the v2-to-FHIR IG and citing the source; reviewers reject
  definitions copied from the standard text.
- This is a reading of public license statements, not legal advice. If HL7 changes its terms, this record is
  superseded.
