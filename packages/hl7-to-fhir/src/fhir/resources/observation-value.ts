// OBX-5, the observation value, to Observation.value[x] by its value type (OBX-2), following the guide's rows for
// OBX-5 and OBX-6 in segment-obx-to-observation:
//
// | OBX-2        | FHIR                                                                                        |
// | ------------ | ------------------------------------------------------------------------------------------- |
// | NM           | valueQuantity, unit from OBX-6; no number: valueString, NUMERIC_RESULT_KEPT_AS_TEXT         |
// | ST, TX, FT   | valueString                                                                                 |
// | CE, CWE, CNE | valueCodeableConcept                                                                        |
// | CF           | valueCodeableConcept, of the coded part (CF carries formatted text the concept cannot hold) |
// | SN           | valueQuantity with comparator, valueRange (`-`) or valueRatio (`:`, `/`), unit from OBX-6   |
// | DT, TS, DTM  | valueDateTime                                                                               |
// | TM           | valueTime                                                                                   |
// | DR           | valuePeriod                                                                                 |
// | ED           | DiagnosticReport.presentedForm (R4 Observation has no valueAttachment)                      |
// | other, empty | no value; dataAbsentReason `unsupported`, UNSUPPORTED_VALUE_TYPE                            |
//
// The unit of a quantity is OBX-6.2, else OBX-6.1; it gets the UCUM system and OBX-6.1 as its code only when OBX-6.3
// names UCUM, because a quantity code without a system is invalid and a code of another system is no unit.
//
// OBX-5 repeats. The repetitions of a text (ST, TX, FT) are lines of one text and become one string with line feeds.
// The repetitions of an encapsulated value are attachments each. Repetitions of any other type are values of their
// own: as the guide's map for repeating OBX-5 does, each becomes an Observation.component with the code of the
// observation and its value, and the observation has no value itself. A value that cannot be read as its type was
// reported by its data type mapper and becomes the dataAbsentReason `error`.
import type { Attachment, Observation, Quantity } from "fhir/r4";

import {
  isIgnoredNull,
  type MappingContext,
  reportIssue,
  text,
  textAt,
} from "../context";
import { mapCwe } from "../datatypes/cwe";
import { mapDr, mapDt, mapTm, mapTs } from "../datatypes/date-time";
import { mapEd } from "../datatypes/ed";
import { mapNm, readDecimal } from "../datatypes/nm";
import { mapSn } from "../datatypes/sn";
import type { Source } from "../source";
import { codingSystemUri } from "../terminology/coding-systems";
import type { AbsentReason } from "./absent";
import {
  field,
  fieldLocation,
  isValued,
  repetitions,
  type SegmentAt,
} from "./segment";
import { joinedLines, type TextDelimiters } from "./text";

/** The value elements of an Observation (and of its components) that OBX-5 maps to. */
export type ValueElement = Pick<
  Observation,
  | "valueQuantity"
  | "valueCodeableConcept"
  | "valueString"
  | "valueRange"
  | "valueRatio"
  | "valueTime"
  | "valueDateTime"
  | "valuePeriod"
>;

/** What OBX-5 maps to, by the rules at the top of this module. */
export type ObservationValue =
  /** OBX-5 is empty. */
  | { readonly kind: "none" }
  /** One value. */
  | { readonly kind: "value"; readonly value: ValueElement }
  /** No value, and why. */
  | { readonly kind: "absent"; readonly reason: AbsentReason }
  /** Several values, each a value or the reason why it is absent. */
  | {
      readonly kind: "components";
      readonly values: readonly (ValueElement | AbsentReason)[];
    }
  /** Encapsulated data for the report. */
  | {
      readonly kind: "attachments";
      readonly attachments: readonly Attachment[];
    };

/** Where the observation is: whether a report can take its encapsulated data, and the separators of free text. */
export interface ValueSettings {
  readonly inReport: boolean;
  readonly delimiters: TextDelimiters;
}

const ucum = "http://unitsofmeasure.org";
const textTypes = new Set(["ST", "TX", "FT"]);

/** Maps OBX-5 by OBX-2, following the rules at the top of this module. */
export function mapObservationValue(
  context: MappingContext,
  obx: SegmentAt,
  { inReport, delimiters }: ValueSettings,
): ObservationValue {
  const typeSource = field(obx, 2);
  const type = text(context, typeSource);
  const values = repetitions(obx, 5).filter(
    (source) => !isIgnoredNull(context, source) && hasContent(source),
  );
  if (values.length === 0) return { kind: "none" };
  if (type !== undefined && textTypes.has(type)) {
    const valueString = joinedLines(context, values, delimiters);
    return valueString === undefined
      ? { kind: "none" }
      : { kind: "value", value: { valueString } };
  }
  if (type === "ED" && inReport) {
    const attachments = values
      .map((source) => mapEd(context, source))
      .filter((attachment) => attachment !== undefined);
    return attachments.length === 0
      ? { kind: "absent", reason: "error" }
      : { kind: "attachments", attachments };
  }
  const map = type === undefined ? undefined : valueMapper(context, obx, type);
  if (map === undefined) {
    reportIssue(
      context,
      "UNSUPPORTED_VALUE_TYPE",
      typeSource?.location ?? fieldLocation(obx, 2),
      type,
    );
    return { kind: "absent", reason: "unsupported" };
  }
  const mapped = values.map(
    (source): ValueElement | AbsentReason => map(source) ?? "error",
  );
  const [only] = mapped;
  if (mapped.length === 1 && only !== undefined) {
    return typeof only === "string"
      ? { kind: "absent", reason: only }
      : { kind: "value", value: only };
  }
  return { kind: "components", values: mapped };
}

/** The mapper of one repetition of OBX-5 of a value type, or `undefined` for a type without one. */
function valueMapper(
  context: MappingContext,
  obx: SegmentAt,
  type: string,
): ((source: Source) => ValueElement | undefined) | undefined {
  switch (type) {
    case "NM": {
      const unit = units(context, obx);
      return (source) => numeric(context, source, unit);
    }
    case "SN": {
      const unit = units(context, obx);
      return (source) => structuredNumeric(context, source, unit);
    }
    case "CE":
    case "CWE":
    case "CNE":
    case "CF":
      return (source) =>
        wrap(mapCwe(context, source), (valueCodeableConcept) => ({
          valueCodeableConcept,
        }));
    case "DT":
      return (source) =>
        wrap(mapDt(context, source), (valueDateTime) => ({ valueDateTime }));
    case "TS":
    case "DTM":
      return (source) =>
        wrap(mapTs(context, source), (valueDateTime) => ({ valueDateTime }));
    case "TM":
      return (source) =>
        wrap(mapTm(context, source), (valueTime) => ({ valueTime }));
    case "DR":
      return (source) =>
        wrap(mapDr(context, source), (valuePeriod) => ({ valuePeriod }));
    default:
      return undefined;
  }
}

/** The unit, and for UCUM its system and code, of the quantities of an OBX (OBX-6). */
type Unit = Pick<Quantity, "unit" | "system" | "code">;

function units(context: MappingContext, obx: SegmentAt): Unit {
  const source = field(obx, 6);
  if (source === undefined || isIgnoredNull(context, source)) return {};
  const code = textAt(context, source, 1);
  const unit = textAt(context, source, 2) ?? code;
  const systemName = textAt(context, source, 3);
  const system =
    systemName === undefined
      ? undefined
      : (context.codeSystems.get(systemName) ?? codingSystemUri(systemName));
  return {
    ...(unit === undefined ? {} : { unit }),
    ...(system === ucum && code !== undefined ? { system, code } : {}),
  };
}

function numeric(
  context: MappingContext,
  source: Source,
  unit: Unit,
): ValueElement | undefined {
  const value = text(context, source);
  if (value === undefined) return undefined;
  // A result that is no number is still the result, so it is kept as text rather than left out as mapNm would.
  if (readDecimal(value) === undefined) {
    reportIssue(context, "NUMERIC_RESULT_KEPT_AS_TEXT", source.location, value);
    return { valueString: value };
  }
  return wrap(mapNm(context, source), (quantity) => ({
    valueQuantity: { ...quantity, ...unit },
  }));
}

function structuredNumeric(
  context: MappingContext,
  source: Source,
  unit: Unit,
): ValueElement | undefined {
  const mapped = mapSn(context, source);
  switch (mapped?.kind) {
    case undefined:
      return undefined;
    case "quantity":
      return { valueQuantity: { ...mapped.quantity, ...unit } };
    case "range": {
      const { low, high } = mapped.range;
      return {
        valueRange: {
          ...(low === undefined ? {} : { low: { ...low, ...unit } }),
          ...(high === undefined ? {} : { high: { ...high, ...unit } }),
        },
      };
    }
    case "ratio": {
      const { numerator, denominator } = mapped.ratio;
      return {
        valueRatio: {
          numerator: { ...numerator, ...unit },
          denominator: { ...denominator, ...unit },
        },
      };
    }
  }
}

/** The value element `build` makes of `value`, or `undefined` when there is no value. */
function wrap<T>(
  value: T | undefined,
  build: (value: T) => ValueElement,
): ValueElement | undefined {
  return value === undefined ? undefined : build(value);
}

/** Whether a repetition holds any text, in any component (a coded value may have only a text: `^Free text`). */
function hasContent(source: Source): boolean {
  const { node } = source;
  if ("components" in node) {
    return node.components.some((component) =>
      component.subcomponents.some(
        (subcomponent) =>
          subcomponent.kind === "value" && subcomponent.value !== "",
      ),
    );
  }
  return isValued(source);
}
