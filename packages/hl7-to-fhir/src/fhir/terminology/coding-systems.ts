// Canonical URIs of the coding systems that HL7 table 0396 abbreviates.
//
// Source of record: HL7 Terminology (THO, CC0) 7.0.1, https://terminology.hl7.org: CodeSystem v2-0396 for the table 0396
// codes, the `v2-nnnn` code systems for HL7 tables, and the NamingSystem resources for the URIs of the external
// terminologies. Only codes and URIs are recorded, never content of those terminologies (ADR 0005).
//
// The set is deliberately limited to the table 0396 codes whose systems have a published FHIR URI that this library
// uses. Every other code, including every local `99zzz` system and `I9` (WHO ICD-9, which has no FHIR URI), yields no
// URI instead of an invented one. `SNM` is absent as well: it is SNOMED II (1984), not SNOMED CT.

/** THO publishes each HL7 v2 table as a code system whose URI ends in the four-digit table number. */
const v2TableSystemPrefix = "http://terminology.hl7.org/CodeSystem/v2-";

/** Table 0396 abbreviations of external terminologies, mapped to their FHIR URIs. */
const externalSystems: ReadonlyMap<string, string> = new Map([
  ["LN", "http://loinc.org"],
  ["SCT", "http://snomed.info/sct"],
  ["UCUM", "http://unitsofmeasure.org"],
  ["I10", "http://hl7.org/fhir/sid/icd-10"],
  ["I9C", "http://hl7.org/fhir/sid/icd-9-cm"],
  ["I9CDX", "http://hl7.org/fhir/sid/icd-9-cm"],
  ["I10C", "http://hl7.org/fhir/sid/icd-10-cm"],
  ["I10P", "http://www.cms.gov/Medicare/Coding/ICD10"],
  ["I9CP", "http://hl7.org/fhir/sid/icd-9-cm"],
  ["C4", "http://www.ama-assn.org/go/cpt"],
  ["NDC", "http://hl7.org/fhir/sid/ndc"],
  ["RXNORM", "http://www.nlm.nih.gov/research/umls/rxnorm"],
  ["CVX", "http://hl7.org/fhir/sid/cvx"],
]);

/**
 * Table 0396 names an HL7 table as `HL7` followed by its four-digit number, for example `HL70203`. THO publishes a
 * code system `v2-nnnn` for every table, so the rule is generic: it does not check that the table exists, because the
 * set of tables grows with each HL7 version and a number that names none still yields the URI THO would use.
 */
const hl7TableAbbreviation = /^HL7(\d{4})$/;

/**
 * The code system URI of HL7 table `table`, given as its four-digit number.
 *
 * @param table - The table number, for example `"0203"`.
 * @returns The THO URI of the table's code system.
 *
 * @example
 * ```ts
 * v2TableSystem("0203"); // "http://terminology.hl7.org/CodeSystem/v2-0203"
 * ```
 */
export function v2TableSystem(table: string): string {
  return `${v2TableSystemPrefix}${table}`;
}

/**
 * The canonical URI of the coding system that table 0396 abbreviates as `code`. The comparison is case-sensitive, as
 * HL7 codes are.
 *
 * @param code - A coding system abbreviation such as `"LN"`, `"SCT"` or `"HL70203"`.
 * @returns The system URI, or `undefined` for local (`99zzz`) and otherwise unknown systems.
 *
 * @example
 * ```ts
 * codingSystemUri("LN"); // "http://loinc.org"
 * codingSystemUri("HL70203"); // "http://terminology.hl7.org/CodeSystem/v2-0203"
 * codingSystemUri("99LOC"); // undefined
 * ```
 */
export function codingSystemUri(code: string): string | undefined {
  const external = externalSystems.get(code);
  if (external !== undefined) return external;
  const table = hl7TableAbbreviation.exec(code)?.[1];
  return table === undefined ? undefined : v2TableSystem(table);
}
