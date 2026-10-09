// What every mapper needs besides the value it maps: the caller's lookup tables, the offset for times that carry none,
// and the list its issues go to. One context belongs to one conversion; nothing is kept between conversions.
import { get } from "../hl7v2/access";
import type { Hl7Message } from "../hl7v2/model";
import { report } from "../shared/collect";
import type { Issue, IssueCode, Location } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { parseDateTime, parseTimezone } from "./date-time-parse";
import { isNullValue, leaf, part, type Source } from "./source";

/** The settings of a conversion that change how values map, normalized from the caller's options. */
export interface MappingSettings {
  /**
   * System URIs of assigning authorities of CX.4, XCN.9 and the like, keyed by the namespace ID (HD.1) or the
   * universal ID (HD.2); they win over the system an ISO, UUID or URI universal ID gives.
   */
  readonly identifierSystems: ReadonlyMap<string, string>;
  /** System URIs of coding systems, keyed by the name of the coding system (CWE.3, CWE.6); they win over table 0396. */
  readonly codeSystems: ReadonlyMap<string, string>;
  /** The offset of times that carry none and come in a message whose MSH-7 carries none either, as FHIR writes it. */
  readonly timezone: string | undefined;
  /** Whether an explicit null `""` the mapping leaves out is reported (`HL7_NULL_IGNORED`), as for transactions. */
  readonly reportNulls: boolean;
}

/** Everything a mapper reads besides its value, and where it reports issues. */
export interface MappingContext extends MappingSettings {
  /** The offset of the message time (MSH-7), which applies to the times of the message that carry none. */
  readonly messageOffset: string | undefined;
  /** The issues of the conversion; mappers add to it through {@link reportIssue} only. */
  readonly issues: Issue[];
}

/** The options of a conversion that settle how values map, as the caller writes them. */
export interface MappingSettingsOptions {
  /** System URIs of assigning authorities by namespace ID or universal ID. */
  readonly identifierSystems?: Readonly<Record<string, unknown>> | undefined;
  /** System URIs of coding systems by name. */
  readonly codeSystems?: Readonly<Record<string, unknown>> | undefined;
  /** The offset of times that carry none: `Z`, or `+hh:mm` / `-hh:mm` of at most 14 hours. */
  readonly timezone?: string | undefined;
  /** Whether an explicit null `""` the mapping leaves out is reported. */
  readonly reportNulls?: boolean | undefined;
}

/** An option whose value cannot be used; `value` is what the caller wrote. */
export interface InvalidSetting {
  readonly option: "timezone";
  readonly value: string;
}

/** The settings of a conversion without caller options: no lookup tables, no time zone, nulls not reported. */
export const defaultMappingSettings: MappingSettings = {
  identifierSystems: new Map(),
  codeSystems: new Map(),
  timezone: undefined,
  reportNulls: false,
};

/**
 * The settings of the caller's options: lookup tables that keys such as `__proto__` cannot subvert (see
 * {@link toLookup}) and a validated time zone.
 *
 * @returns The settings, or the option that cannot be used: a `timezone` that is no FHIR offset.
 *
 * @example
 * ```ts
 * createMappingSettings({ timezone: "+01:00" }); // { ok: true, value: { timezone: "+01:00", ... } }
 * createMappingSettings({ timezone: "Europe/Berlin" }); // { ok: false, error: { option: "timezone", ... } }
 * ```
 */
export function createMappingSettings(
  options: MappingSettingsOptions = {},
): Result<MappingSettings, InvalidSetting> {
  const { timezone } = options;
  if (timezone !== undefined && parseTimezone(timezone) === undefined) {
    return err({ option: "timezone", value: timezone });
  }
  return ok({
    identifierSystems: toLookup(options.identifierSystems),
    codeSystems: toLookup(options.codeSystems),
    timezone,
    reportNulls: options.reportNulls ?? false,
  });
}

/**
 * The context for mapping `message`, reporting to `issues`.
 *
 * @example
 * ```ts
 * const issues: Issue[] = [];
 * const context = createMappingContext(message, { ...defaultMappingSettings, timezone: "+01:00" }, issues);
 * const birthDate = mapTs(context, fieldValue(pid, pidIndex, 7), "date");
 * ```
 */
export function createMappingContext(
  message: Hl7Message,
  settings: MappingSettings,
  issues: Issue[],
): MappingContext {
  const sent = get(message, "MSH.7");
  const messageOffset =
    sent === undefined ? undefined : parseDateTime(sent)?.offset;
  return { ...settings, messageOffset, issues };
}

/**
 * A lookup table from a record of the caller's options. Only own properties with a string value count, so keys such
 * as `__proto__`, `constructor` or `toString` are ordinary keys and never reach `Object.prototype`.
 *
 * @example
 * ```ts
 * toLookup({ HOSP: "urn:oid:2.16.840.1.113883.19.5" }).get("HOSP"); // "urn:oid:2.16.840.1.113883.19.5"
 * toLookup({}).get("constructor"); // undefined
 * ```
 */
export function toLookup(
  record: Readonly<Record<string, unknown>> | undefined,
): ReadonlyMap<string, string> {
  const entries = Object.entries(record ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return new Map(entries);
}

/** Adds the issue of `code` at `location` to the issues of the conversion (see `report`). */
export function reportIssue(
  context: MappingContext,
  code: IssueCode,
  location: Location,
  value?: string,
): void {
  report(context.issues, code, location, value);
}

/**
 * Whether a value is the explicit null `""` as a whole, which the mapping leaves out; reports `HL7_NULL_IGNORED` when
 * the context asks for it. A mapper calls it first, so a null field is reported once, at the field.
 */
export function isIgnoredNull(
  context: MappingContext,
  source: Source,
): boolean {
  const ignored = isNullValue(source);
  if (ignored && context.reportNulls) {
    reportIssue(context, "HL7_NULL_IGNORED", source.location);
  }
  return ignored;
}

/**
 * The source itself, or `undefined` when it is absent or the explicit null `""`, which is reported as
 * {@link isIgnoredNull} says. Every mapper of a composite type starts with it, so a null is reported once, at the
 * value, and not at each of its parts.
 */
export function present(
  context: MappingContext,
  source: Source | undefined,
): Source | undefined {
  return source === undefined || isIgnoredNull(context, source)
    ? undefined
    : source;
}

/**
 * The text of a primitive value, or `undefined` when it has none: absent, empty or the explicit null `""`, which is
 * reported as {@link isIgnoredNull} says.
 */
export function text(
  context: MappingContext,
  source: Source | undefined,
): string | undefined {
  const value = present(context, source);
  if (value === undefined) return undefined;
  const subcomponent = leaf(value);
  return subcomponent?.kind === "value" && subcomponent.value !== ""
    ? subcomponent.value
    : undefined;
}

/** The text of part `n` of a value (see {@link part} and {@link text}). */
export function textAt(
  context: MappingContext,
  source: Source | undefined,
  n: number,
): string | undefined {
  return text(context, part(source, n));
}
