// The options of `convert` and `createConverter`, and their normalization: every record the caller passes must be a
// plain object and becomes a `Map`, so a key such as `__proto__` or `constructor` is an ordinary key, and every option
// is checked once, when the converter is created, so a mistake fails with `INVALID_OPTIONS` instead of surfacing in the
// middle of a conversion.
import type {
  DiagnosticReport,
  Encounter,
  Observation,
  Patient,
} from "fhir/r4";

import { definitionsOf } from "../hl7v2/definition-options";
import type { SegmentDefinition } from "../hl7v2/definitions/types";
import type { Hl7Message, Segment } from "../hl7v2/model";
import { isValidSegmentId } from "../hl7v2/segment";
import type { Issue } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { createMappingSettings, type MappingSettings } from "./context";
import { type IdGenerator, randomId } from "./ids";

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
export interface MappedResources {
  readonly Patient: Patient;
  readonly Encounter: Encounter;
  readonly Observation: Observation;
  readonly DiagnosticReport: DiagnosticReport;
}

/** The type of a resource a conversion creates: `"Patient"`, `"Encounter"`, `"Observation"` or `"DiagnosticReport"`. */
export type MappedResourceType = keyof MappedResources;

const mappedResourceTypes: readonly MappedResourceType[] = [
  "Patient",
  "Encounter",
  "Observation",
  "DiagnosticReport",
];

/**
 * What a hook learns about where it is called: the message and the segment the resource or the call comes from.
 *
 * @example
 * ```ts
 * import type { HookContext } from "hl7-to-fhir";
 *
 * declare const context: HookContext;
 *
 * const segment = context.message.segments[context.segmentIndex];
 * ```
 */
export interface HookContext {
  /** The parsed message. */
  readonly message: Hl7Message;
  /** The 0-based index in `message.segments` of the segment the resource or the call comes from. */
  readonly segmentIndex: number;
}

/**
 * The context of a segment mapper: a {@link HookContext} and a way to change the resources the conversion created.
 *
 * @example
 * ```ts
 * import type { SegmentMapperContext } from "hl7-to-fhir";
 *
 * declare const context: SegmentMapperContext;
 *
 * context.extend("Patient", (patient) => ({ ...patient, active: true }));
 * ```
 */
export interface SegmentMapperContext extends HookContext {
  /**
   * Replaces a resource of the bundle by what `update` returns for it. The resource is the last one of the type that
   * comes from a segment before the mapped segment, so a Z segment after a PID changes the Patient of that PID, or
   * else the first one of the type. `update` runs at once and must return a resource of the same type.
   *
   * When the bundle has no resource of the type, nothing changes and the issue `EXTENSION_TARGET_MISSING` says so. A
   * type that is no {@link MappedResourceType} fails the conversion with `HOOK_FAILED`. `extend` works only while the
   * segment mapper runs: called later, from a context the mapper kept, it throws a `TypeError`.
   *
   * @param resourceType - The type of the resource to change.
   * @param update - Returns the changed resource; it must not change the resource it receives.
   */
  readonly extend: <T extends MappedResourceType>(
    resourceType: T,
    update: (resource: MappedResources[T]) => MappedResources[T],
  ) => void;
}

/**
 * Maps a segment, typically a Z segment the library does not map, by changing the resources through `context.extend`.
 * It runs after the built-in mapping, once for every segment with its identifier, in message order; that includes
 * segments the library maps itself, such as PID, whose resources it can then change. It must be synchronous: a mapper
 * that returns a promise or another thenable fails the conversion with `HOOK_FAILED`.
 *
 * @example
 * ```ts
 * import type { SegmentMapper } from "hl7-to-fhir";
 *
 * const zpi: SegmentMapper = (segment, context) => {
 *   const colour = segment.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0];
 *   if (colour?.kind !== "value") return;
 *   context.extend("Patient", (patient) => ({
 *     ...patient,
 *     extension: [{ url: "https://example.org/fhir/favourite-colour", valueString: colour.value }],
 *   }));
 * };
 * ```
 */
export type SegmentMapper = (
  segment: Segment,
  context: SegmentMapperContext,
) => void;

/**
 * Changes a resource of a type after the mapping and the segment mappers, before it goes into the bundle. It must
 * return a resource of the same type, synchronously, and must not change the one it receives.
 *
 * @example
 * ```ts
 * import type { Customizer } from "hl7-to-fhir";
 *
 * const activate: Customizer<"Patient"> = (patient) => ({ ...patient, active: true });
 * ```
 */
export type Customizer<T extends MappedResourceType> = (
  resource: MappedResources[T],
  context: HookContext,
) => MappedResources[T];

/**
 * A customizer per resource type.
 *
 * @example
 * ```ts
 * import type { Customizers } from "hl7-to-fhir";
 *
 * const customize: Customizers = { Observation: (observation) => ({ ...observation, language: "en" }) };
 * ```
 */
export type Customizers = {
  readonly [T in MappedResourceType]?: Customizer<T> | undefined;
};

/**
 * The kind of bundle a conversion writes: `collection`, plain data (the default), or `transaction`, which a FHIR server
 * executes. A transaction finds the Patient and the Encounter by their first identifier with a system: it creates them
 * only if the server has none with it, and for an update event (A08, A13) it updates them by it. DiagnosticReports and
 * Observations are always created: v2.5.1 gives them no identifier a server could match, so a result message sent
 * again, or a corrected one, creates them again.
 */
export type BundleType = "collection" | "transaction";

/**
 * The options of `convert` and `createConverter`. Every option is optional.
 *
 * @example
 * ```ts
 * import { convert, sequentialIds, type ConvertOptions } from "hl7-to-fhir";
 *
 * const options: ConvertOptions = {
 *   identifierSystems: { HOSP: "urn:oid:2.16.840.1.113883.19.5" },
 *   codeSystems: { L: "https://example.org/fhir/CodeSystem/lab-codes" },
 *   timezone: "+01:00",
 *   ids: sequentialIds("example"),
 *   bundleType: "transaction",
 * };
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|1|P|2.5.1\rPID|1||12345^^^HOSP^MR", options);
 * if (result.ok) result.value.bundle.type; // => "transaction"
 * ```
 */
export interface ConvertOptions {
  /**
   * Definitions of segments the library does not define, made with `defineSegment` of `hl7-to-fhir/hl7v2`. They are
   * used when the message is checked and grouped, as `validate` and `group` use them.
   */
  readonly segments?: readonly SegmentDefinition[] | undefined;
  /**
   * Mappers for segments by segment identifier, such as `{ ZPI: mapZpi }`; they run after the built-in mapping. A plain
   * object; a segment of the message that neither the library nor a mapper maps is reported as `SEGMENT_NOT_MAPPED`.
   */
  readonly segmentMappers?: Readonly<Record<string, SegmentMapper>> | undefined;
  /** Customizers by resource type, a plain object, which change each resource of their type before the bundle. */
  readonly customize?: Customizers | undefined;
  /**
   * System URIs of coding systems, keyed by the name a message uses in CWE.3 or CE.3, such as
   * `{ L: "https://example.org/fhir/CodeSystem/lab-codes" }`, a plain object; they win over the URIs of HL7 table 0396.
   */
  readonly codeSystems?: Readonly<Record<string, string>> | undefined;
  /**
   * System URIs of identifiers, keyed by the assigning authority a message uses (the namespace ID, HD.1, or else the
   * universal ID, HD.2), such as `{ HOSP: "urn:oid:2.16.840.1.113883.19.5" }`, a plain object. An assigning authority
   * with an ISO OID or a UUID needs no entry.
   */
  readonly identifierSystems?: Readonly<Record<string, string>> | undefined;
  /** Makes the ids of the resources; random UUIDs by default. Use `sequentialIds` for repeatable bundles in tests. */
  readonly ids?: IdGenerator | undefined;
  /**
   * The offset from UTC of times without one, when MSH-7 has none either, as FHIR writes it: `"+01:00"`, `"-05:00"`,
   * `"Z"`. Without it, such a time is cut to its date, with an issue, because FHIR requires an offset.
   */
  readonly timezone?: string | undefined;
  /** The kind of bundle: `"collection"` (the default) or `"transaction"`. */
  readonly bundleType?: BundleType | undefined;
}

/** A function of the caller: its parameters are known, but what it returns must be checked before it is used. */
type Untrusted<P extends unknown[]> = (...parameters: P) => unknown;

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

/** The options, checked and normalized: the settings of one converter. */
export interface ConverterSettings {
  readonly segments: readonly SegmentDefinition[];
  readonly segmentMappers: ReadonlyMap<
    string,
    Untrusted<[Segment, SegmentMapperContext]>
  >;
  readonly customize: ReadonlyMap<
    MappedResourceType,
    Untrusted<[MappedResource, HookContext]>
  >;
  readonly mapping: MappingSettings;
  readonly ids: Untrusted<[number]>;
  readonly bundleType: BundleType;
}

/** Why the options are invalid: the option, as a path into the options, and what is wrong with it. */
export interface InvalidOption {
  readonly option: string;
  readonly problem: string;
}

const optionNames: ReadonlySet<string> = new Set([
  "segments",
  "segmentMappers",
  "customize",
  "codeSystems",
  "identifierSystems",
  "ids",
  "timezone",
  "bundleType",
]);

/** Checks the options a caller passed (in plain JavaScript, anything) and normalizes them into settings. */
export function normalizeOptions(
  given: unknown,
): Result<ConverterSettings, InvalidOption> {
  const options = given ?? {};
  if (!isRecord(options)) return invalid("options", "must be an object");
  const unknownOption = Object.keys(options).find(
    (key) => !optionNames.has(key),
  );
  if (unknownOption !== undefined) {
    return invalid(unknownOption, "is not an option");
  }
  const segments = segmentsOf(options["segments"]);
  if (!segments.ok) return segments;
  const segmentMappers = recordOf(
    "segmentMappers",
    options["segmentMappers"],
    (key): key is string => isValidSegmentId(key),
    isFunction,
    "must map segment identifiers to functions",
  );
  if (!segmentMappers.ok) return segmentMappers;
  const customize = recordOf(
    "customize",
    options["customize"],
    isMappedResourceType,
    isFunction,
    `must map the resource types ${mappedResourceTypes.join(", ")} to functions`,
  );
  if (!customize.ok) return customize;
  const codeSystems = recordOf(
    "codeSystems",
    options["codeSystems"],
    isText,
    isText,
    "must map names of coding systems to URIs",
  );
  if (!codeSystems.ok) return codeSystems;
  const identifierSystems = recordOf(
    "identifierSystems",
    options["identifierSystems"],
    isText,
    isText,
    "must map assigning authorities to URIs",
  );
  if (!identifierSystems.ok) return identifierSystems;
  const { ids = randomId, timezone, bundleType = "collection" } = options;
  if (!isFunction(ids)) return invalid("ids", "must be a function");
  if (timezone !== undefined && typeof timezone !== "string") {
    return invalid("timezone", timezoneProblem);
  }
  if (bundleType !== "collection" && bundleType !== "transaction") {
    return invalid("bundleType", 'must be "collection" or "transaction"');
  }
  const mapping = createMappingSettings({
    codeSystems: Object.fromEntries(codeSystems.value),
    identifierSystems: Object.fromEntries(identifierSystems.value),
    timezone,
    reportNulls: bundleType === "transaction",
  });
  if (!mapping.ok) return invalid(mapping.error.option, timezoneProblem);
  return ok({
    segments: segments.value,
    segmentMappers: segmentMappers.value,
    customize: customize.value,
    mapping: mapping.value,
    ids,
    bundleType,
  });
}

const timezoneProblem =
  'must be an offset from UTC as FHIR writes it, such as "+01:00" or "Z"';

/** The segment definitions, checked as `validate` checks them. */
function segmentsOf(
  segments: unknown,
): Result<readonly SegmentDefinition[], InvalidOption> {
  if (segments === undefined) return ok([]);
  const problems: Issue[] = [];
  const definitions = definitionsOf({ segments }, problems);
  const [problem] = problems;
  return problem === undefined
    ? ok([...definitions.values()])
    : invalid("segments", problem.value ?? "must be an array");
}

/**
 * A record of the options as a `Map` of its own enumerable entries, each checked by `isKey` and `isValue`. The record
 * must be a plain object: a `Map`, an array or a class instance would lose its entries silently. A key such as
 * `__proto__` that is an own property (from `JSON.parse`, for example) is an entry like any other.
 */
function recordOf<K extends string, V>(
  option: string,
  record: unknown,
  isKey: (key: string) => key is K,
  isValue: (value: unknown) => value is V,
  problem: string,
): Result<ReadonlyMap<K, V>, InvalidOption> {
  if (record === undefined) return ok(new Map());
  if (!isPlainObject(record))
    return invalid(option, `${problem} in a plain object`);
  const entries: [K, V][] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!isKey(key) || !isValue(value)) {
      return invalid(`${option}.${key}`, problem);
    }
    entries.push([key, value]);
  }
  return ok(new Map(entries));
}

/**
 * Whether a value can be called. What a caller's function takes and returns cannot be checked at runtime, so it is
 * typed as returning `unknown`, and what it returns is checked where it is called.
 */
function isFunction(value: unknown): value is Untrusted<unknown[]> {
  return typeof value === "function";
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether a value names a resource type a conversion creates. */
export function isMappedResourceType(key: unknown): key is MappedResourceType {
  return (mappedResourceTypes as readonly unknown[]).includes(key);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is an object literal, `JSON.parse` output or made by `Object.create(null)`. */
function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(
  option: string,
  problem: string,
): Result<never, InvalidOption> {
  return err({ option, problem });
}
