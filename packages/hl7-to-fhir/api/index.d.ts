import { _ as Issue, b as Severity, d as Hl7Message, m as Segment, n as Ok, o as SegmentDefinition, r as Result, t as Err, v as IssueCode, x as Span, y as Location } from "./result.js";
import { Bundle, DiagnosticReport, Encounter, Observation, Patient } from "fhir/r4";
//#region src/fhir/ids.d.ts
/**
 * Makes the id of each resource of a bundle: a UUID, new within the conversion. `urn:uuid:` fullUrls require it in
 * lowercase, so upper-case letters are lowered.
 *
 * It is called once per resource, in bundle order, with the 0-based position of the resource in the bundle, so a
 * generator can derive the id from the position and needs no state of its own.
 *
 * @example
 * ```ts
 * import { convert, type IdGenerator } from "hl7-to-fhir";
 *
 * const fixed: IdGenerator = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345", { ids: fixed });
 * if (result.ok) result.value.bundle.entry?.[0]?.fullUrl; // => "urn:uuid:00000000-0000-4000-8000-000000000000"
 * ```
 */
type IdGenerator = (index: number) => string;
/**
 * Makes ids that depend only on `prefix` and the position of the resource in the bundle, so the same message always
 * converts to the same bundle: for tests, golden files and documentation. Different prefixes give different ids.
 *
 * Do not use them for data that leaves your tests: every conversion with the same prefix reuses the same ids, so
 * resources of different messages would claim to be the same.
 *
 * @param prefix - Any text that tells the ids of one test or document apart from another's.
 * @returns A generator for the `ids` option.
 *
 * @example
 * ```ts
 * import { convert, sequentialIds } from "hl7-to-fhir";
 *
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345", {
 *   ids: sequentialIds("docs"),
 * });
 * if (result.ok) result.value.bundle.entry?.[0]?.fullUrl; // => "urn:uuid:28eb34d2-0000-4000-8000-000000000001"
 * ```
 */
export declare function sequentialIds(prefix: string): IdGenerator;
//#endregion
//#region src/fhir/options.d.ts
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
interface HookContext {
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
interface SegmentMapperContext extends HookContext {
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
  readonly extend: <T extends MappedResourceType>(resourceType: T, update: (resource: MappedResources[T]) => MappedResources[T]) => void;
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
type SegmentMapper = (segment: Segment, context: SegmentMapperContext) => void;
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
type Customizer<T extends MappedResourceType> = (resource: MappedResources[T], context: HookContext) => MappedResources[T];
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
type Customizers = { readonly [T in MappedResourceType]?: Customizer<T> | undefined; };
/**
 * The kind of bundle a conversion writes: `collection`, plain data (the default), or `transaction`, which a FHIR server
 * executes. A transaction finds the Patient and the Encounter by their first identifier with a system: it creates them
 * only if the server has none with it, and for an update event (A08, A13) it updates them by it. DiagnosticReports and
 * Observations are always created: v2.5.1 gives them no identifier a server could match, so a result message sent
 * again, or a corrected one, creates them again.
 */
type BundleType = "collection" | "transaction";
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
interface ConvertOptions {
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
type MappedResource = MappedResources[MappedResourceType];
//#endregion
//#region src/fhir/convert.d.ts
/**
 * A converted message: the FHIR bundle, the parsed message it came from, and everything noticed on the way.
 *
 * @example
 * ```ts
 * import { convert, type Conversion } from "hl7-to-fhir";
 *
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345");
 * if (result.ok) {
 *   const { bundle, issues }: Conversion = result.value;
 *   bundle.entry?.map((entry) => entry.resource?.resourceType); // => ["Patient"]
 *   issues.some((issue) => issue.code === "SEGMENT_MISSING"); // => true
 * }
 * ```
 */
interface Conversion {
  /** The FHIR R4 bundle: a `collection`, or a `transaction` when the options ask for one. */
  readonly bundle: Bundle<MappedResource>;
  /** The parsed message, for reading values the mapping does not carry over (`get` of `hl7-to-fhir/hl7v2`). */
  readonly message: Hl7Message;
  /**
   * What parsing, validation against HL7 v2.5.1 and the mapping noticed, in message order: the issues of `parse` and
   * `validate`, and those of the mapping, such as a time cut to its date or a segment the conversion does not map
   * (`SEGMENT_NOT_MAPPED`). An issue two of them found is listed once. At most 10,000, followed by `TOO_MANY_ISSUES`
   * when there are more.
   */
  readonly issues: readonly Issue[];
}
/**
 * Why {@link convert} failed, discriminated by `code`. Every failure has a `message` without message content and the
 * `issues` found before it failed; each code then has its own locator.
 *
 * - `PARSE_FAILED`: the input is not an HL7 v2 message (see `parse`); the last issue says why.
 * - `UNSUPPORTED_MESSAGE`: the message is not one the library converts: the structure (MSH-9) must be ADT_A01 with
 *   the trigger event A01, A04, A08 or A13, or ORU_R01 with the trigger event R01. A trigger event in MSH-9.2 decides
 *   even when MSH-9.3 names a supported structure, as in `ADT^A03^ADT_A01`.
 * - `INVALID_OPTIONS`: an option is invalid; `option` names it and `message` says what it must be.
 * - `HOOK_FAILED`: a hook of the options threw, returned something other than it must or was not synchronous; `hook`
 *   names it, `location` is the segment it was called for and `cause` holds what it threw.
 *
 * @example
 * ```ts
 * import { convert } from "hl7-to-fhir";
 *
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000||ACK^A01|1|P|2.5.1\rMSA|AA|1");
 * if (!result.ok) {
 *   result.error.code; // => "UNSUPPORTED_MESSAGE"
 *   if (result.error.code === "UNSUPPORTED_MESSAGE") result.error.location.field; // => 9
 * }
 * ```
 */
type ConvertFailure = {
  readonly code: "PARSE_FAILED";
  readonly message: string;
  /** The issues of `parse`, ending with the one that stopped it. */
  readonly issues: readonly Issue[];
} | {
  readonly code: "UNSUPPORTED_MESSAGE";
  readonly message: string;
  /** The issues of parsing and validation. */
  readonly issues: readonly Issue[];
  /** MSH-9, the message type, which names the structure, or MSH-9.2 when only the trigger event is unsupported. */
  readonly location: Location;
} | {
  readonly code: "INVALID_OPTIONS";
  readonly message: string;
  /** Always empty: the options are checked before any message. */
  readonly issues: readonly Issue[];
  /** The invalid option, such as `timezone` or `customize.Practitioner`. */
  readonly option: string;
} | {
  readonly code: "HOOK_FAILED";
  readonly message: string;
  /** The issues found before the hook failed. */
  readonly issues: readonly Issue[];
  /** The option of the hook, such as `customize.Patient`, `segmentMappers.ZPI` or `ids`. */
  readonly hook: string;
  /** The segment the hook was called for. */
  readonly location: Location;
  /**
   * What the hook threw, or a `TypeError` describing what it returned instead of what it must. It comes from the
   * caller's code and may contain message content.
   */
  readonly cause: unknown;
};
/**
 * The code of a {@link ConvertFailure}: `PARSE_FAILED`, `UNSUPPORTED_MESSAGE`, `INVALID_OPTIONS` or `HOOK_FAILED`.
 *
 * @example
 * ```ts
 * import type { ConvertFailureCode } from "hl7-to-fhir";
 *
 * const retryable = (code: ConvertFailureCode): boolean => code === "HOOK_FAILED";
 * ```
 */
type ConvertFailureCode = ConvertFailure["code"];
/**
 * A conversion function with fixed options, made by {@link createConverter}.
 *
 * @example
 * ```ts
 * import { createConverter, type Converter } from "hl7-to-fhir";
 *
 * const toFhir: Converter = createConverter({ timezone: "+01:00" });
 * toFhir("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|1|P|2.5.1\rPID|1||12345").ok; // => true
 * ```
 */
type Converter = (input: string) => Result<Conversion, ConvertFailure>;
/**
 * Converts an HL7 v2 message to a FHIR R4 bundle.
 *
 * The message is parsed leniently, checked against HL7 v2.5.1 and mapped by the HL7 Version 2 to FHIR Implementation
 * Guide: ADT_A01 messages (A01, A04, A08, A13) to a Patient, an Encounter and Observations, ORU_R01 messages to
 * Patients, Encounters, DiagnosticReports and Observations. Practitioners and locations are logical references, and
 * every reference between resources resolves inside the bundle through `urn:uuid:` fullUrls.
 *
 * Everything that deviates from the standard or could not be mapped exactly is in `issues`, as is every segment the
 * conversion leaves out; the conversion fails only when the input is no HL7 v2 message, its structure or trigger
 * event is not supported, an option is invalid or a hook fails. It never throws. To convert many messages with the same options, make the converter once with {@link createConverter}.
 *
 * @param input - One message as text; split batch files with `splitBatch` of `hl7-to-fhir/hl7v2` first.
 * @param options - Options of the conversion; see {@link ConvertOptions}.
 * @returns The bundle, the message and the issues, or why the conversion failed.
 *
 * @example
 * ```ts
 * import { convert } from "hl7-to-fhir";
 *
 * const result = convert(
 *   "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20240115103000+0100||ADT^A01^ADT_A01|MSG00001|P|2.5.1\rPID|1||12345^^^HOSP^MR||Everyman^Adam||19800101|M",
 * );
 * if (result.ok) {
 *   const patient = result.value.bundle.entry?.[0]?.resource;
 *   if (patient?.resourceType === "Patient") patient.birthDate; // => "1980-01-01"
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export declare function convert(input: string, options?: ConvertOptions): Result<Conversion, ConvertFailure>;
/**
 * Makes a conversion function with fixed options: the options are checked and prepared once, so converting many
 * messages costs no more than converting one each.
 *
 * Records in the options (`segmentMappers`, `customize`, `codeSystems`, `identifierSystems`) are read once, as their
 * own properties, so later changes to them have no effect and keys such as `__proto__` or `constructor` are ordinary
 * keys. When an option is invalid, every call of the returned function fails with `INVALID_OPTIONS`.
 *
 * Hooks run in this order for each message: the segment mappers, in message order, then the customizers of each
 * resource, in bundle order. Hooks must be synchronous. A hook that throws, returns a promise or returns something
 * other than a resource of the type it got fails the conversion with `HOOK_FAILED` instead of throwing.
 *
 * @param options - The options of every conversion; see {@link ConvertOptions}.
 * @returns A function that converts one message, like {@link convert}.
 *
 * @example
 * ```ts
 * import { createConverter } from "hl7-to-fhir";
 * import { defineSegment } from "hl7-to-fhir/hl7v2";
 *
 * const toFhir = createConverter({
 *   segments: [defineSegment({ id: "ZPI", fields: [{ name: "setId", dataType: "SI" }, { name: "colour", dataType: "ST" }] })],
 *   segmentMappers: {
 *     ZPI: (segment, context) => {
 *       const colour = segment.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0];
 *       if (colour?.kind !== "value") return;
 *       context.extend("Patient", (patient) => ({
 *         ...patient,
 *         extension: [{ url: "https://example.org/fhir/favourite-colour", valueString: colour.value }],
 *       }));
 *     },
 *   },
 *   customize: { Patient: (patient) => ({ ...patient, active: true }) },
 * });
 * const result = toFhir("MSH|^~\\&|ADT|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345\rZPI|1|blue");
 * if (result.ok) {
 *   const patient = result.value.bundle.entry?.[0]?.resource;
 *   if (patient?.resourceType === "Patient") patient.extension?.[0]?.valueString; // => "blue"
 * }
 * ```
 */
export declare function createConverter(options?: ConvertOptions): Converter;
//#endregion
export type { BundleType, Conversion, ConvertFailure, ConvertFailureCode, ConvertOptions, Converter, Customizer, Customizers, Err, HookContext, IdGenerator, Issue, IssueCode, Location, MappedResource, MappedResourceType, MappedResources, Ok, Result, SegmentMapper, SegmentMapperContext, Severity, Span };