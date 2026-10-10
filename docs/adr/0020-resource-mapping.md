# 0020. Resource mapping: required elements and observation values

- Status: accepted
- Date: 2026-10-10
- Implementation: implemented (`src/fhir/resources/`; one test per rule in `test/fhir/resources/`)

## Context

FHIR R4 requires elements that HL7 v2 may leave empty or fill with codes FHIR does not have: an Observation needs a
status and a code, a DiagnosticReport a status and a code, an Encounter a status and a class. The guide
([ADR 0012](0012-mapping-source-and-fhir-types.md)) gives a source for each, but not what to write when the source is
empty, and it leaves Encounter.status to "the event". OBX-5 holds values of any type, named by OBX-2, and repeats;
R4 Observation has no attachment value. A converter that writes nothing for a required element produces invalid FHIR;
one that guesses produces wrong FHIR.

## Decision

**Every required element has a source and a fallback, and a fallback is reported.**

| Element                 | Source (guide row)                               | Empty source                                               | Unmapped code                                 |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| Observation.status      | OBX-11 via table 0085 ConceptMap                 | `unknown`, `REQUIRED_ELEMENT_DEFAULTED`                    | `unknown`, `UNMAPPED_CODE` (see below)        |
| Observation.code        | OBX-3                                            | data-absent-reason `unknown`, `REQUIRED_ELEMENT_DEFAULTED` | —                                             |
| DiagnosticReport.status | OBR-25 via table 0123 ConceptMap                 | `unknown`, `REQUIRED_ELEMENT_DEFAULTED`                    | `unknown`, `UNMAPPED_CODE` (see below)        |
| DiagnosticReport.code   | OBR-4                                            | data-absent-reason `unknown`, `REQUIRED_ELEMENT_DEFAULTED` | —                                             |
| Encounter.class         | PV1-2 via table 0004 ConceptMap (v3 ActCode)     | data-absent-reason `unknown`, `REQUIRED_ELEMENT_DEFAULTED` | data-absent-reason `unknown`, `UNMAPPED_CODE` |
| Encounter.status        | trigger event and PV1-45, else PV1-2 (see below) | `unknown` (PV1-2 already reported)                         | `unknown`                                     |
| Bundle.type             | the `bundleType` option                          | `collection`                                               | —                                             |

`unknown` is a code of each status value set; a data-absent-reason extension satisfies ele-1 on a required complex
element and states why the value is missing, as FHIR intends. A status code the guide's ConceptMap lists as unmatched
(table 0085: B, I, N, O, R, S, U, V; table 0123: A, M, N, Y, Z) becomes `unknown` without an issue, as every lookup of
the data type layer treats the guide's deliberate gaps; only a code the guide does not know is `UNMAPPED_CODE`.

**Encounter.status**, in this order: A13 (cancel discharge) is `in-progress`; a discharge date in PV1-45 is
`finished` (guide row PV1-45); A01 (admit) and A04 (register) are `in-progress`; every other case (A08 update, ORU
messages) takes the patient class through the guide's map `table-hl70004-to-encounter-status` (`P` is `planned`, `U`
`unknown`, the others `in-progress`), as the guide's row PV1-2 says for an empty PV1-45.

**Observation statuses.** The guide's ConceptMap is followed exactly: `W` and `D` are `entered-in-error` (the plan
expected `D` as `cancelled`; the guide maps it to `entered-in-error`), `X` is `cancelled`. A result that could not be
obtained (`X`) or was not asked for (`N`, the guide's row for OBX-11) carries no value, whatever OBX-5 holds, and says
why in `dataAbsentReason` (`not-performed`, `not-asked`); obs-6 forbids both. These codes are handled on purpose and
never reported as `UNMAPPED_CODE`, even where the ConceptMap has no status for them (`N`).

**Interpretation.** The abnormal flags of OBX-8 go through the guide's ConceptMap
`table-hl70078-to-v3-observationinterpretation` to the v3 `ObservationInterpretation` codes of the same spelling, the
code system `Observation.interpretation` is bound to; a `v2-0078` coding would fall outside the value set. The flags
the map leaves unmatched (AC, HM, OBX, QCF, TOX) are left out silently, any other code is `UNMAPPED_CODE`.

**Patient.gender.** PID-8 through the guide's ConceptMap of table 0001. `O`, `A` (ambiguous) and `N` (not applicable)
all map to `other`; to keep the original, the code as sent is written to the R4 extension `originalText` on
`_gender` whenever its FHIR code stands for more than one code of the table. A time of birth goes into the guide's
extension `patient-birthTime` on `_birthDate`.

**Observation values** by OBX-2:

| OBX-2        | FHIR                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| NM           | `valueQuantity` ([ADR 0016](0016-numbers.md)); no number: `valueString`, `NUMERIC_RESULT_KEPT_AS_TEXT` |
| ST, TX, FT   | `valueString`; escaped line breaks are line feeds; text split at unescaped separators is joined back   |
| CE, CWE, CNE | `valueCodeableConcept`                                                                                 |
| CF           | `valueCodeableConcept` of the coded part, as for CWE                                                   |
| SN           | `valueQuantity` with comparator, `valueRange` (`-`) or `valueRatio` (`:`, `/`)                         |
| DT, TS, DTM  | `valueDateTime`                                                                                        |
| TM           | `valueTime`                                                                                            |
| DR           | `valuePeriod`                                                                                          |
| ED           | the report's `presentedForm`, titled by OBX-3; no Observation (see below)                              |
| other, empty | no value, `dataAbsentReason` `unsupported`, `UNSUPPORTED_VALUE_TYPE`                                   |

The unit of a quantity is OBX-6.2, else OBX-6.1; it has the UCUM system and OBX-6.1 as code only when OBX-6.3 names
UCUM (by table 0396 or the `codeSystems` option), because a code without its system is invalid (qty-3). A value that
does not have the form of its type is left out by its data type mapper, which reports why, and the observation states
`dataAbsentReason` `error`. ED outside a report (an OBX of an ADT message) has nowhere to go in R4 and is unsupported.

A number that is no number is kept as text (`NUMERIC_RESULT_KEPT_AS_TEXT`) rather than left out as other numbers are
(`NON_NUMERIC_VALUE`): an observation value is the result itself, and `1,5` or `>10` still tells the reader what the
sender meant. Each code names the other in its documentation.

**Attachments.** An ED observation becomes an attachment of its report, which carries only the data and the name of
the observation, so the rest of the OBX is checked before it is dropped. When OBX-11 says the result was withdrawn or
deleted (`W`, `D`, mapped to `entered-in-error`), cancelled or could not be obtained (`X`) or was not asked for (`N`),
the data is no content of the report: it is left out, reported as `ATTACHMENT_LEFT_OUT`. A status other than final and
the notes (NTE) of the observation have no place in `presentedForm`; each is reported as `ATTACHMENT_DETAIL_DROPPED`
(the status at OBX-11, a note at its NTE) instead of dropped silently.

**Repeating OBX-5.** Repetitions of text are lines of one text and become one string. Repetitions of any other type
are values of their own: as the guide's map for repeating OBX-5 does, each becomes an `Observation.component` with the
observation's code and its value (or its `dataAbsentReason`), and the observation has no value itself (obs-7).

**Other choices.** OBX-14 is the observation time. When it is empty, the observation takes the time of its order,
which v2 defines as the clinically relevant time of the order's observations, exactly as the report carries it:
OBR-7 as `effectiveDateTime`, or the period from OBR-7 to OBR-8 as `effectivePeriod` when OBR-8 is sent. Outside an
order (ADT) an observation without OBX-14 has no time. NTE segments of an OBSERVATION group are the observation's
notes. The observations of an ADT message refer to its Encounter, except in a registration (A04): the guide's row for
`ADT_A01.OBSERVATION.OBX` leaves the link to the implementer and notes that observations of an event before the visit,
such as the initial registration, do not belong to it. The order numbers
of OBR-2 and OBR-3 are DiagnosticReport identifiers typed PLAC and FILL, with ORC-2 and ORC-3 standing in when the OBR
leaves them empty. PV1-19 is the Encounter identifier typed VN.

**New issue codes.** `REQUIRED_ELEMENT_DEFAULTED`, `NUMERIC_RESULT_KEPT_AS_TEXT`, `UNSUPPORTED_VALUE_TYPE`,
`ATTACHMENT_LEFT_OUT`, `ATTACHMENT_DETAIL_DROPPED`, `CONDITIONAL_REQUEST_UNAVAILABLE` and `EXTENSION_TARGET_MISSING`
(warnings) and `SEGMENT_NOT_MAPPED` (info), with the meaning of their value documented in `IssueCode`.

## Alternatives considered

- **Leaving a required element out.** Invalid FHIR; every FHIR server rejects it.
- **`final` as the default status.** Claims a result is final when the sender did not say so.
- **Dropping repeated OBX-5 values after the first.** Silently loses results.
- **An Observation with a data-absent-reason for a withdrawn ED result.** It would state an empty result where the
  sender withdrew one; the report simply does not carry it, and the issue says so.
- **The encounter link for every ADT observation.** For a registration the guide itself says the observation is not
  of the visit.
- **`valueAttachment` through the R5 extension the guide names.** A cross-version extension the R4 validator and most
  receivers do not know; the report's `presentedForm` is the R4 place for a rendered result.
- **No original code for `other`.** The FHIR value set has four codes; A and N would become indistinguishable from O.

## Consequences

- Every bundle validates against R4 even for incomplete messages, and every fallback is visible in the issues.
- Receivers see `unknown` statuses where the sender gave none, which is accurate but may need handling.
- Text observations keep the sender's structure as text; structured interpretation is up to the receiver.
