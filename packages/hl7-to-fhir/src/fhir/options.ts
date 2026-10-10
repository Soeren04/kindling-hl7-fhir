// The options of `convert` and `createConverter`, and the types they share with the mapping: the resources a
// conversion creates and the kind of bundle it writes.
import type {
  DiagnosticReport,
  Encounter,
  Observation,
  Patient,
} from "fhir/r4";

/**
 * The FHIR resources a conversion creates, by resource type: the types `customize` and `extend` accept.
 *
 * @example
 * ```ts
 * import type { MappedResources } from "hl7-to-fhir";
 *
 * type Patient = MappedResources["Patient"];
 * ```
 */
interface MappedResources {
  readonly Patient: Patient;
  readonly Encounter: Encounter;
  readonly Observation: Observation;
  readonly DiagnosticReport: DiagnosticReport;
}

/** The type of a resource a conversion creates: `"Patient"`, `"Encounter"`, `"Observation"` or `"DiagnosticReport"`. */
type MappedResourceType = keyof MappedResources;

/**
 * The kind of bundle a conversion writes: `collection`, plain data (the default), or `transaction`, which a FHIR server
 * executes. A transaction finds the Patient and the Encounter by their first identifier with a system: it creates them
 * only if the server has none with it, and for an update event (A08, A13) it updates them by it. DiagnosticReports and
 * Observations are always created: v2.5.1 gives them no identifier a server could match, so a result message sent
 * again, or a corrected one, creates them again.
 */
export type BundleType = "collection" | "transaction";

/**
 * A resource a conversion creates: a Patient, Encounter, Observation or DiagnosticReport.
 *
 * @example
 * ```ts
 * import type { MappedResource } from "hl7-to-fhir";
 *
 * declare const resource: MappedResource;
 *
 * if (resource.resourceType === "Observation") console.log(resource.status);
 * ```
 */
export type MappedResource = MappedResources[MappedResourceType];
