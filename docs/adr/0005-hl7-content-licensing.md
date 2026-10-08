# 0005. HL7 content licensing

- Status: accepted
- Date: 2026-10-08
- Implementation: `NOTICE` ships with the package now; the data files this record governs are added with the
  validation and mapping phases.

## Context

Parsing, validating and mapping HL7 v2 needs metadata from the standard: segment and field identifiers and names,
data types, optionality and cardinality, message structures, and table codes. HL7 International owns the HL7 v2
standard, and this project is MIT licensed. We need to know what may be redistributed in an open source package.

Findings, with the page each rests on (checked 2026-10-08):

- **HL7 v2 standard documents** are licensed under the HL7 IP policy (<https://www.hl7.org/legal/ippolicy.cfm>). The
  license text that HL7 prints in its publications authorizes non-members to read and use the "Specified Material" to
  evaluate or implement it and to build products that implement, but do not directly incorporate, it. Incorporating
  Specified Material into a product requires HL7 organizational membership.
- **HL7 Terminology (THO)**, <https://terminology.hl7.org/license.html>, which publishes the HL7 v2 tables as code
  systems (for example `http://terminology.hl7.org/CodeSystem/v2-0203`), is made available under CC0 and attributed
  to Health Level Seven International. The shipped subset is not the official terminology, so `NOTICE` labels it as
  a derivative work.
- **HL7 Version 2 to FHIR Implementation Guide** 1.0.0 (STU 1), <https://hl7.org/fhir/uv/v2mappings/>, declares
  `license: CC0-1.0` in its source configuration,
  [`sushi-config.yaml`](https://github.com/HL7/v2-to-fhir/blob/master/sushi-config.yaml) in the IG repository, which
  also sets `copyrightYear: 2020+`. Its segment, data type and vocabulary maps list v2 fields with their
  identifiers, names, data types and cardinalities.
- **FHIR R4** (4.0.1), <https://hl7.org/fhir/R4/license.html>, is released under CC0. The same page covers the
  HL7, HEALTH LEVEL SEVEN and FHIR trademarks; CC0 does not grant rights to the trademarks.
- Third-party terminologies referenced by HL7 (LOINC, SNOMED CT, UCUM) have their own licenses.

Assumption and residual risk: the IG's field and segment tables reproduce structural facts from the v2 standard
(identifiers, names, data types, cardinality). We rely on the IG's CC0 declaration covering them, as the IG
authors, HL7 International, are also the owners of the v2 standard. We found no HL7 statement that
specifically confirms this for v2 content inside the IG, so the risk is not zero. It is limited by shipping only
identifiers, short names, types and cardinalities, never prose, and by the rule below that every data file records
its source, so affected files can be found and removed.

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
  direct incorporation of Specified Material, which the IP policy license reserves to HL7 organizational members.
- **Ship no metadata and validate nothing.** Avoids the question but removes validation and readable diagnostics.

## Consequences

- The package is safe to redistribute under MIT, with HL7 attribution in `NOTICE`.
- Adding a segment or table means sourcing it from THO or the v2-to-FHIR IG and citing the source; reviewers reject
  definitions copied from the standard text.
- This is a reading of public license statements, not legal advice. If HL7 changes its terms, or objects to the
  assumption above, this record is superseded.
