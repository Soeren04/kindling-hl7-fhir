// Data-absent-reason: how FHIR says why a value is missing. A required element without a source gets the extension
// (ele-1 is satisfied by an extension), an observation without a value gets Observation.dataAbsentReason.
import type { CodeableConcept, Extension } from "fhir/r4";

/** The codes of the R4 code system `data-absent-reason` the mapping uses. */
export type AbsentReason =
  "unknown" | "not-asked" | "unsupported" | "error" | "not-performed";

const extensionUrl =
  "http://hl7.org/fhir/StructureDefinition/data-absent-reason";
const codeSystem = "http://terminology.hl7.org/CodeSystem/data-absent-reason";

/** An element that holds nothing but the reason why its value is missing, for an element FHIR requires. */
export function absentElement(reason: AbsentReason): {
  readonly extension: Extension[];
} {
  return { extension: [{ url: extensionUrl, valueCode: reason }] };
}

/** The reason as the value of `dataAbsentReason` of an Observation or one of its components. */
export function absentReason(reason: AbsentReason): CodeableConcept {
  return { coding: [{ system: codeSystem, code: reason }] };
}
