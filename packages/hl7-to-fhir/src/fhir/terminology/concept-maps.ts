// HL7 v2 table codes mapped to FHIR R4 codes: the ConceptMaps of the HL7 Version 2 to FHIR Implementation Guide for
// tables 0001, 0004 (patient class), 0085, 0123, 0190, 0200, 0201 and 0202.
//
// Source of record: HL7 Version 2 to FHIR Implementation Guide 1.0.0 (STU 1, CC0),
// https://hl7.org/fhir/uv/v2mappings/, resources ConceptMap-table-hl7NNNN-to-* of the npm package
// hl7.fhir.uv.v2mappings@1.0.0. Only codes and short display names are recorded, never prose (ADR 0005).
//
// The IG map table-hl70004-to-encounter-status is deliberately not used: Encounter.status is derived from the trigger
// event and PV1-45 in the resource mapper, not from the patient class.
//
// A code that a ConceptMap lists as unmatched, or does not list at all, is absent from its map: the lookup returns
// `undefined` instead of guessing a target. The codes the IG lists as unmatched, a deliberate gap, are also recorded
// in an `...Unmatched` set, so that a caller can tell them from a code the IG does not know, which it reports.
// Lookups are case-sensitive, as HL7 codes are, and use `Map` and `Set` so that keys such as `__proto__` or
// `constructor` cannot reach object prototypes.

/** The code system of the v3 act codes that the IG maps the patient classes E, I, O and P to. */
const actCodeSystem = "http://terminology.hl7.org/CodeSystem/v3-ActCode";

/** The code system of HL7 table 0004, which stands in where the IG has no v3 ActCode for a patient class. */
const patientClassSystem = "http://terminology.hl7.org/CodeSystem/v2-0004";

/** FHIR `administrative-gender` codes. */
export type AdministrativeGender = "male" | "female" | "other" | "unknown";

/** A coding of an encounter class: a v3 ActCode, or the table 0004 code itself where the IG maps no ActCode. */
export interface EncounterClassCoding {
  readonly system: string;
  readonly code: string;
  readonly display: string;
}

/** FHIR `observation-status` codes that table 0085 maps to. */
export type ObservationStatus =
  | "amended"
  | "corrected"
  | "entered-in-error"
  | "final"
  | "preliminary"
  | "cancelled";

/** FHIR `diagnostic-report-status` codes that table 0123 maps to. */
export type DiagnosticReportStatus =
  | "registered"
  | "preliminary"
  | "partial"
  | "corrected"
  | "final"
  | "cancelled";

/** FHIR `name-use` codes that table 0200 maps to. */
export type NameUse =
  "usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden";

/** FHIR `address-use` codes that table 0190 maps to. */
export type AddressUse = "home" | "work" | "temp" | "old" | "billing";

/** FHIR `address-type` codes that table 0190 maps to. */
export type AddressType = "postal";

/** FHIR `contact-point-use` codes that tables 0201 and 0202 map to. */
export type TelecomUse = "home" | "work" | "mobile";

/** FHIR `contact-point-system` codes that table 0202 maps to. */
export type TelecomSystem = "phone" | "fax" | "email" | "pager" | "other";

/**
 * Table 0001 (Administrative Sex) to FHIR `administrative-gender`.
 * IG ConceptMap `table-hl70001-to-administrative-gender`.
 */
export const administrativeGenderMap: ReadonlyMap<
  string,
  AdministrativeGender
> = new Map([
  ["F", "female"],
  ["M", "male"],
  ["O", "other"],
  ["U", "unknown"],
  ["A", "other"],
  ["N", "other"],
]);

/**
 * Table 0004 (Patient Class) to a coding of the encounter class.
 * IG ConceptMap `table-hl70004-to-v3-actcode`: E, I, O and P map to v3 ActCode, the other classes map to themselves
 * in table 0004. Displays are the short names of the target code systems.
 */
export const encounterClassMap: ReadonlyMap<string, EncounterClassCoding> =
  new Map([
    ["E", { system: actCodeSystem, code: "EMER", display: "emergency" }],
    [
      "I",
      { system: actCodeSystem, code: "IMP", display: "inpatient encounter" },
    ],
    ["O", { system: actCodeSystem, code: "AMB", display: "ambulatory" }],
    ["P", { system: actCodeSystem, code: "PRENC", display: "pre-admission" }],
    [
      "R",
      { system: patientClassSystem, code: "R", display: "Recurring patient" },
    ],
    ["B", { system: patientClassSystem, code: "B", display: "Obstetrics" }],
    [
      "C",
      { system: patientClassSystem, code: "C", display: "Commercial Account" },
    ],
    ["N", { system: patientClassSystem, code: "N", display: "Not Applicable" }],
    ["U", { system: patientClassSystem, code: "U", display: "Unknown" }],
  ]);

/**
 * Table 0085 (Observation Result Status) to FHIR `observation-status`.
 * IG ConceptMap `table-hl70085-to-observation-status`. B, I, N, O, R, S, U and V are unmatched in the IG and absent
 * here.
 */
export const observationStatusMap: ReadonlyMap<string, ObservationStatus> =
  new Map([
    ["A", "amended"],
    ["C", "corrected"],
    ["D", "entered-in-error"],
    ["F", "final"],
    ["P", "preliminary"],
    ["X", "cancelled"],
    ["W", "entered-in-error"],
  ]);

/**
 * Table 0123 (Result Status) to FHIR `diagnostic-report-status`.
 * IG ConceptMap `table-hl70123-queries-to-diagnostic-report-status`. A, M, N, Y and Z are unmatched in the IG and
 * absent here.
 */
export const diagnosticReportStatusMap: ReadonlyMap<
  string,
  DiagnosticReportStatus
> = new Map([
  ["O", "registered"],
  ["I", "registered"],
  ["S", "registered"],
  ["P", "preliminary"],
  ["C", "corrected"],
  ["R", "partial"],
  ["F", "final"],
  ["X", "cancelled"],
]);

/**
 * Table 0200 (Name Type) to FHIR `name-use`.
 * IG ConceptMap `table-hl70200-to-name-use`. The other codes of the table are unmatched in the IG and absent here.
 */
export const nameUseMap: ReadonlyMap<string, NameUse> = new Map([
  ["BAD", "old"],
  ["D", "usual"],
  ["L", "official"],
  ["M", "maiden"],
  ["MSK", "anonymous"],
  ["N", "nickname"],
  ["NAV", "temp"],
  ["R", "official"],
  ["TEMP", "temp"],
]);

/**
 * Table 0190 (Address Type) to FHIR `address-use`.
 * IG ConceptMap `table-hl70190-to-address-use`. The other codes of the table are unmatched in the IG and absent here.
 */
export const addressUseMap: ReadonlyMap<string, AddressUse> = new Map([
  ["BA", "old"],
  ["BI", "billing"],
  ["C", "temp"],
  ["B", "work"],
  ["H", "home"],
  ["O", "work"],
]);

/**
 * Table 0190 (Address Type) to FHIR `address-type`.
 * IG ConceptMap `table-hl70190-to-address-type`. The other codes of the table are unmatched in the IG and absent here.
 */
export const addressTypeMap: ReadonlyMap<string, AddressType> = new Map([
  ["M", "postal"],
  ["SH", "postal"],
]);

/**
 * Table 0201 (Telecommunication Use Code) to FHIR `contact-point-use`.
 * IG ConceptMap `table-hl70201-to-contact-point-use`. The other codes of the table are unmatched in the IG and
 * absent here.
 */
export const telecomUseMap: ReadonlyMap<string, TelecomUse> = new Map([
  ["PRN", "home"],
  ["WPN", "work"],
  ["PRS", "mobile"],
]);

/**
 * Table 0202 (Telecommunication Equipment Type) to FHIR `contact-point-system`.
 * IG ConceptMap `table-hl70202-to-contact-point-system`, group for `contact-point-system`. The code `CP` is in the
 * `telecomEquipmentUseMap` instead because the IG maps it to a use.
 */
export const telecomSystemMap: ReadonlyMap<string, TelecomSystem> = new Map([
  ["PH", "phone"],
  ["FX", "fax"],
  ["MD", "other"],
  ["SAT", "other"],
  ["BP", "pager"],
  ["Internet", "email"],
  ["X.400", "email"],
  ["TDD", "other"],
  ["TTY", "other"],
]);

/**
 * Table 0202 (Telecommunication Equipment Type) to FHIR `contact-point-use`.
 * IG ConceptMap `table-hl70202-to-contact-point-system`, group for `contact-point-use`: a cellular phone is a mobile
 * use, not a system.
 */
export const telecomEquipmentUseMap: ReadonlyMap<string, TelecomUse> = new Map([
  ["CP", "mobile"],
]);

/** Table 0085 codes that the IG lists as unmatched in `table-hl70085-to-observation-status`. */
export const observationStatusUnmatched: ReadonlySet<string> = new Set([
  "B",
  "I",
  "N",
  "O",
  "R",
  "S",
  "U",
  "V",
]);

/** Table 0123 codes that the IG lists as unmatched in `table-hl70123-queries-to-diagnostic-report-status`. */
export const diagnosticReportStatusUnmatched: ReadonlySet<string> = new Set([
  "A",
  "M",
  "N",
  "Y",
  "Z",
]);

/** Table 0200 codes that the IG lists as unmatched in `table-hl70200-to-name-use`. */
export const nameUseUnmatched: ReadonlySet<string> = new Set([
  "A",
  "B",
  "C",
  "F",
  "I",
  "K",
  "NB",
  "NOUSE",
  "P",
  "REL",
  "S",
  "T",
  "U",
]);

/**
 * Table 0190 codes that the IG lists as unmatched in both `table-hl70190-to-address-use` and
 * `table-hl70190-to-address-type`: the ones that are neither a use nor a type of a FHIR address.
 */
export const addressUnmatched: ReadonlySet<string> = new Set([
  "N",
  "BDL",
  "F",
  "L",
  "P",
  "RH",
  "BR",
  "S",
  "TM",
  "V",
]);

/** Table 0201 codes that the IG lists as unmatched in `table-hl70201-to-contact-point-use`. */
export const telecomUseUnmatched: ReadonlySet<string> = new Set([
  "ORN",
  "VHN",
  "ASN",
  "EMR",
  "NET",
  "BPN",
]);

/**
 * The FHIR administrative gender of an administrative sex (table 0001) code.
 *
 * @param code - A table 0001 code such as `"F"`.
 * @returns The gender, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * administrativeGender("F"); // "female"
 * administrativeGender("X"); // undefined
 * ```
 */
export function administrativeGender(
  code: string,
): AdministrativeGender | undefined {
  return administrativeGenderMap.get(code);
}

/**
 * The encounter class coding of a patient class (table 0004) code.
 *
 * @param code - A table 0004 code such as `"I"`.
 * @returns The coding, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * encounterClass("I"); // { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", ... }
 * ```
 */
export function encounterClass(code: string): EncounterClassCoding | undefined {
  return encounterClassMap.get(code);
}

/**
 * The FHIR observation status of an observation result status (table 0085) code.
 *
 * @param code - A table 0085 code such as `"F"`.
 * @returns The status, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * observationStatus("F"); // "final"
 * observationStatus("R"); // undefined
 * ```
 */
export function observationStatus(code: string): ObservationStatus | undefined {
  return observationStatusMap.get(code);
}

/**
 * The FHIR diagnostic report status of a result status (table 0123) code.
 *
 * @param code - A table 0123 code such as `"F"`.
 * @returns The status, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * diagnosticReportStatus("R"); // "partial"
 * diagnosticReportStatus("Z"); // undefined
 * ```
 */
export function diagnosticReportStatus(
  code: string,
): DiagnosticReportStatus | undefined {
  return diagnosticReportStatusMap.get(code);
}

/**
 * The FHIR `HumanName.use` of a name type (table 0200) code.
 *
 * @param code - A table 0200 code such as `"L"`.
 * @returns The use, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * nameUse("L"); // "official"
 * ```
 */
export function nameUse(code: string): NameUse | undefined {
  return nameUseMap.get(code);
}

/**
 * The FHIR `Address.use` of an address type (table 0190) code.
 *
 * @param code - A table 0190 code such as `"H"`.
 * @returns The use, or `undefined` for a code the IG does not map to a use.
 *
 * @example
 * ```ts
 * addressUse("H"); // "home"
 * addressUse("M"); // undefined, mailing is an address type
 * ```
 */
export function addressUse(code: string): AddressUse | undefined {
  return addressUseMap.get(code);
}

/**
 * The FHIR `Address.type` of an address type (table 0190) code.
 *
 * @param code - A table 0190 code such as `"M"`.
 * @returns The type, or `undefined` for a code the IG does not map to a type.
 *
 * @example
 * ```ts
 * addressType("M"); // "postal"
 * addressType("H"); // undefined, home is an address use
 * ```
 */
export function addressType(code: string): AddressType | undefined {
  return addressTypeMap.get(code);
}

/**
 * The FHIR `ContactPoint.use` of a telecommunication use (table 0201) code.
 *
 * @param code - A table 0201 code such as `"WPN"`.
 * @returns The use, or `undefined` for a code the IG does not map.
 *
 * @example
 * ```ts
 * telecomUse("WPN"); // "work"
 * ```
 */
export function telecomUse(code: string): TelecomUse | undefined {
  return telecomUseMap.get(code);
}

/**
 * The FHIR `ContactPoint.system` of a telecommunication equipment type (table 0202) code.
 *
 * @param code - A table 0202 code such as `"PH"`.
 * @returns The system, or `undefined` for a code the IG does not map to a system, including `CP`.
 *
 * @example
 * ```ts
 * telecomSystem("Internet"); // "email"
 * ```
 */
export function telecomSystem(code: string): TelecomSystem | undefined {
  return telecomSystemMap.get(code);
}

/**
 * The FHIR `ContactPoint.use` that a telecommunication equipment type (table 0202) code implies.
 *
 * @param code - A table 0202 code such as `"CP"`.
 * @returns `"mobile"` for a cellular phone, otherwise `undefined`.
 *
 * @example
 * ```ts
 * telecomEquipmentUse("CP"); // "mobile"
 * telecomEquipmentUse("PH"); // undefined
 * ```
 */
export function telecomEquipmentUse(code: string): TelecomUse | undefined {
  return telecomEquipmentUseMap.get(code);
}
