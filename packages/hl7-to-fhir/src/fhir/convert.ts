// convert and createConverter: parse, validate, group, map, run the caller's hooks and assemble the bundle (ADR 0019).
import type { Bundle } from "fhir/r4";

import { get } from "../hl7v2/access";
import { group, type MessageGroups } from "../hl7v2/group";
import type { Hl7Message } from "../hl7v2/model";
import { parse } from "../hl7v2/parse";
import { validate } from "../hl7v2/validate";
import type { Issue, Location } from "../shared/issue";
import { mergeIssues } from "../shared/merge-issues";
import { err, ok, type Result } from "../shared/result";
import { emptySpanAt } from "../shared/span";
import { assembleBundle } from "./bundle";
import {
  createMappingContext,
  type MappingContext,
  reportIssue,
} from "./context";
import { type HookFailure, runHook } from "./hooks";
import { createUrlSource } from "./ids";
import { mapAdtA01 } from "./messages/adt-a01";
import type { MappedEntry, MessageMapping } from "./messages/mapping";
import { mapOruR01 } from "./messages/oru-r01";
import {
  type ConverterSettings,
  type ConvertOptions,
  type InvalidOption,
  isMappedResourceType,
  type MappedResource,
  type MappedResources,
  type MappedResourceType,
  normalizeOptions,
  type SegmentMapperContext,
} from "./options";
import {
  field,
  fieldLocation,
  segmentLocation,
  type SegmentAt,
} from "./resources/segment";
import { part } from "./source";

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
export interface Conversion {
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
export type ConvertFailure =
  | {
      readonly code: "PARSE_FAILED";
      readonly message: string;
      /** The issues of `parse`, ending with the one that stopped it. */
      readonly issues: readonly Issue[];
    }
  | {
      readonly code: "UNSUPPORTED_MESSAGE";
      readonly message: string;
      /** The issues of parsing and validation. */
      readonly issues: readonly Issue[];
      /** MSH-9, the message type, which names the structure, or MSH-9.2 when only the trigger event is unsupported. */
      readonly location: Location;
    }
  | {
      readonly code: "INVALID_OPTIONS";
      readonly message: string;
      /** Always empty: the options are checked before any message. */
      readonly issues: readonly Issue[];
      /** The invalid option, such as `timezone` or `customize.Practitioner`. */
      readonly option: string;
    }
  | {
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
export type ConvertFailureCode = ConvertFailure["code"];

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
export type Converter = (input: string) => Result<Conversion, ConvertFailure>;

/** A message structure the library converts: its trigger events (table 0354) and its mapper. */
interface SupportedStructure {
  readonly events: ReadonlySet<string>;
  readonly map: (
    mapping: MessageMapping,
    groups: MessageGroups,
  ) => MappedEntry[];
}

/** The message structures the library converts. */
const supportedStructures: ReadonlyMap<string, SupportedStructure> = new Map([
  [
    "ADT_A01",
    { events: new Set(["A01", "A04", "A08", "A13"]), map: mapAdtA01 },
  ],
  ["ORU_R01", { events: new Set(["R01"]), map: mapOruR01 }],
]);

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
export function convert(
  input: string,
  options?: ConvertOptions,
): Result<Conversion, ConvertFailure> {
  return createConverter(options)(input);
}

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
export function createConverter(options?: ConvertOptions): Converter {
  const settings = normalizeOptions(options);
  if (!settings.ok) {
    const failure = invalidOptions(settings.error);
    return () => err(failure);
  }
  return (input) => convertWith(settings.value, input);
}

function convertWith(
  settings: ConverterSettings,
  input: string,
): Result<Conversion, ConvertFailure> {
  const parsed = parse(input);
  if (!parsed.ok) {
    return err({
      code: "PARSE_FAILED",
      message:
        "The input could not be read as an HL7 v2 message; the last issue says why.",
      issues: parsed.error.issues,
    });
  }
  const { message } = parsed.value;
  const definitions = { segments: settings.segments };
  const found = [parsed.value.issues, validate(message, definitions)];
  const issuesSoFar = (): Issue[] => mergeIssues(found, input.length);
  const groups = group(message, definitions);
  const supported = supportedMessage(message, groups);
  if (!supported.ok) {
    return err({
      code: "UNSUPPORTED_MESSAGE",
      ...supported.error,
      issues: issuesSoFar(),
    });
  }
  const { structure, msh, event } = supported.value;
  const mappingIssues: Issue[] = [];
  found.push(mappingIssues);
  const context = createMappingContext(
    message,
    settings.mapping,
    mappingIssues,
  );
  const urls = createUrlSource(settings.ids);
  const { component, subcomponent } = message.delimiters;
  // The MSH is the bundle itself.
  const mapped = new Set<number>([msh.segmentIndex]);
  const entries = structure.map(
    {
      context,
      message,
      delimiters: { component, subcomponent },
      nextUrl: urls.next,
      markMapped: ({ segmentIndex }) => mapped.add(segmentIndex),
    },
    groups,
  );
  const idFailure = urls.failure();
  if (idFailure !== undefined) {
    return err(hookFailed(idFailure, issuesSoFar()));
  }
  reportUnmappedSegments(context, message, mapped, settings);
  const hooked = runHooks(settings, context, message, entries);
  if (!hooked.ok) return err(hookFailed(hooked.error, issuesSoFar()));
  const bundle = assembleBundle(context, msh, hooked.value, {
    type: settings.bundleType,
    event,
  });
  return ok({ bundle, message, issues: issuesSoFar() });
}

/** A message the library converts: the mapping of its structure, its MSH segment and its trigger event. */
interface SupportedMessage {
  readonly structure: SupportedStructure;
  readonly msh: SegmentAt;
  readonly event: string | undefined;
}

/** The structure, MSH and trigger event of a message, or the message and location of `UNSUPPORTED_MESSAGE`. */
function supportedMessage(
  message: Hl7Message,
  groups: MessageGroups,
): Result<
  SupportedMessage,
  { readonly message: string; readonly location: Location }
> {
  // parse succeeds only with an MSH segment first, so `header` is always there.
  const [header] = message.segments;
  const structure =
    groups.structure === undefined
      ? undefined
      : supportedStructures.get(groups.structure);
  if (structure === undefined || header === undefined) {
    return err({
      message:
        "The message structure (MSH-9) is not one the library converts: ADT_A01 (events A01, A04, A08, A13) or ORU_R01.",
      location:
        header === undefined
          ? { span: emptySpanAt(0) }
          : fieldLocation({ segment: header, segmentIndex: 0 }, 9),
    });
  }
  const msh: SegmentAt = { segment: header, segmentIndex: 0 };
  const event = get(message, "MSH.9.2");
  if (event !== undefined && !structure.events.has(event)) {
    return err({
      message:
        "The trigger event (MSH-9.2) is not one the library converts for the message structure: A01, A04, A08 or A13 for ADT_A01, R01 for ORU_R01.",
      location: part(field(msh, 9), 2)?.location ?? fieldLocation(msh, 9),
    });
  }
  return ok({ structure, msh, event });
}

/**
 * Reports `SEGMENT_NOT_MAPPED` for the segments that neither the mapping nor a segment mapper carries into the bundle,
 * once per segment identifier, at the first such segment.
 */
function reportUnmappedSegments(
  context: MappingContext,
  message: Hl7Message,
  mapped: ReadonlySet<number>,
  { segmentMappers }: ConverterSettings,
): void {
  const reported = new Set<string>();
  for (const [segmentIndex, segment] of message.segments.entries()) {
    const { id } = segment;
    if (
      mapped.has(segmentIndex) ||
      segmentMappers.has(id) ||
      reported.has(id)
    ) {
      continue;
    }
    reported.add(id);
    reportIssue(
      context,
      "SEGMENT_NOT_MAPPED",
      segmentLocation({ segment, segmentIndex }),
    );
  }
}

/**
 * Runs the segment mappers, in message order, and then the customizers, in bundle order, on the mapped resources.
 *
 * @returns The resources as the hooks left them, or the first hook that failed.
 */
function runHooks(
  settings: ConverterSettings,
  context: MappingContext,
  message: Hl7Message,
  mapped: readonly MappedEntry[],
): Result<readonly MappedEntry[], HookFailure> {
  const entries = [...mapped];
  for (const [segmentIndex, segment] of message.segments.entries()) {
    const mapper = settings.segmentMappers.get(segment.id);
    if (mapper === undefined) continue;
    const source = { segment, segmentIndex };
    const location = segmentLocation(source);
    const hook = `segmentMappers.${segment.id}`;
    // A failure of an extension, which must not throw into the caller's mapper; the first one fails the conversion.
    const failures: HookFailure[] = [];
    let running = true;
    const mapperContext: SegmentMapperContext = {
      message,
      segmentIndex,
      extend: (resourceType, update) => {
        if (!running) {
          // A context kept beyond the mapper, by a callback or an async mapper, must not change a finished bundle.
          throw new TypeError(
            `The context of ${hook} can extend resources only while the mapper runs.`,
          );
        }
        if (failures.length > 0) return;
        if (!isMappedResourceType(resourceType)) {
          const cause = new TypeError(
            `${hook} extended a resource type the conversion does not create; extend takes Patient, Encounter, Observation or DiagnosticReport.`,
          );
          failures.push({ hook, location, cause });
          return;
        }
        const target = extensionTarget(entries, resourceType, segmentIndex);
        const entry = target === undefined ? undefined : entries[target];
        if (target === undefined || entry === undefined) {
          reportIssue(
            context,
            "EXTENSION_TARGET_MISSING",
            location,
            resourceType,
          );
          return;
        }
        // `update` is typed for the resource type it asked for, which is the type of `entry.resource`.
        const call = update as (resource: MappedResource) => unknown;
        const updated = checkedResource(hook, source, resourceType, () =>
          call(entry.resource),
        );
        if (updated.ok) entries[target] = { ...entry, resource: updated.value };
        else failures.push(updated.error);
      },
    };
    const ran = runHook(hook, location, () =>
      isThenable(mapper(segment, mapperContext)),
    );
    running = false;
    if (!ran.ok) return ran;
    if (ran.value) {
      const cause = new TypeError(
        `The segment mapper ${hook} returned a promise or another thenable; segment mappers must be synchronous.`,
      );
      return err({ hook, location, cause });
    }
    const [failure] = failures;
    if (failure !== undefined) return err(failure);
  }
  for (const [index, entry] of entries.entries()) {
    const { resourceType } = entry.resource;
    const customizer = settings.customize.get(resourceType);
    if (customizer === undefined) continue;
    const { segmentIndex } = entry.source;
    const customized = checkedResource(
      `customize.${resourceType}`,
      entry.source,
      resourceType,
      () => customizer(entry.resource, { message, segmentIndex }),
    );
    if (!customized.ok) return customized;
    entries[index] = { ...entry, resource: customized.value };
  }
  return ok(entries);
}

/**
 * The position of the resource a segment mapper extends: the last of the type mapped from a segment before the
 * mapped segment, else the first of the type.
 */
function extensionTarget(
  entries: readonly MappedEntry[],
  resourceType: MappedResourceType,
  segmentIndex: number,
): number | undefined {
  const ofType = [...entries.entries()].filter(
    ([, entry]) => entry.resource.resourceType === resourceType,
  );
  const before = ofType.filter(
    ([, entry]) => entry.source.segmentIndex < segmentIndex,
  );
  return (before.at(-1) ?? ofType[0])?.[0];
}

/**
 * Runs a hook that must return a resource of `resourceType`, synchronously, and checks that it does. The check reads
 * what the hook returned, which may throw (a getter, a proxy), so it runs inside the guard as well.
 */
function checkedResource(
  hook: string,
  source: SegmentAt,
  resourceType: MappedResourceType,
  call: () => unknown,
): Result<MappedResource, HookFailure> {
  const location = segmentLocation(source);
  const returned = runHook(hook, location, (): Returned => {
    const value = call();
    if (isThenable(value)) return { kind: "thenable" };
    return isResourceOf(value, resourceType)
      ? { kind: "resource", resource: value }
      : { kind: "other" };
  });
  if (!returned.ok) return returned;
  if (returned.value.kind === "resource") return ok(returned.value.resource);
  const cause = new TypeError(
    returned.value.kind === "thenable"
      ? `The hook ${hook} returned a promise or another thenable; hooks must be synchronous.`
      : `The hook ${hook} must return a ${resourceType} resource.`,
  );
  return err({ hook, location, cause });
}

/** What a hook that must return a resource returned. */
type Returned =
  | { readonly kind: "resource"; readonly resource: MappedResource }
  | { readonly kind: "thenable" }
  | { readonly kind: "other" };

function isResourceOf<T extends MappedResourceType>(
  value: unknown,
  resourceType: T,
): value is MappedResources[T] {
  return (
    typeof value === "object" &&
    value !== null &&
    "resourceType" in value &&
    value.resourceType === resourceType
  );
}

/** Whether a value is a promise or another thenable: something with a `then` method, as `await` reads it. */
function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function invalidOptions({ option, problem }: InvalidOption): ConvertFailure {
  return {
    code: "INVALID_OPTIONS",
    message: `The option ${option} ${problem}.`,
    issues: [],
    option,
  };
}

function hookFailed(
  { hook, location, cause }: HookFailure,
  issues: readonly Issue[],
): ConvertFailure {
  return {
    code: "HOOK_FAILED",
    message:
      "A hook passed in the options threw, or returned something other than it must; cause holds what it threw.",
    issues,
    hook,
    location,
    cause,
  };
}
