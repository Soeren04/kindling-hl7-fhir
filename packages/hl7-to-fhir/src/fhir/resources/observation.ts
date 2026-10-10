// OBX (with the NTE segments after it) to Observation, by the guide's map segment-obx-to-observation and the NTE row
// of its message maps.
//
// FHIR requires a status and a code:
// - The status is OBX-11 through the guide's ConceptMap of table 0085 (`W` and `D` are `entered-in-error`, `X`
//   `cancelled`). A code without equivalent becomes `unknown`: silently when the guide leaves it unmatched or the
//   mapping handles it on purpose (`N`, see below), else reported as UNMAPPED_CODE. An empty OBX-11 becomes `unknown`
//   as well (REQUIRED_ELEMENT_DEFAULTED).
// - The code is OBX-3; without one, an element with the data-absent-reason `unknown` (REQUIRED_ELEMENT_DEFAULTED).
//
// A result that could not be obtained (`X`) or was not asked for (`N`, the guide's row for OBX-11) carries no value,
// whatever OBX-5 holds, and says why in dataAbsentReason (`not-performed`, `not-asked`). The value itself follows
// ./observation-value.ts. The abnormal flags (OBX-8) go through the guide's ConceptMap of table 0078 to the v3
// ObservationInterpretation codes Observation.interpretation is bound to. Responsible observers (OBX-16) are logical
// references (ADR 0014).
//
// The time of the observation is OBX-14, the guide's row. Senders often leave it empty when the time of the order
// applies, which v2 defines as the clinically relevant time of the order's observations, so in an order the time of
// the report (./effective.ts: OBR-7, or the period from OBR-7 to OBR-8) stands in for an empty OBX-14.
import type {
  Annotation,
  CodeableConcept,
  Observation,
  ObservationComponent,
} from "fhir/r4";

import { compact, nonEmpty } from "../compact";
import { mapCode } from "../datatypes/code";
import { type MappingContext, reportIssue, text } from "../context";
import { mapCwe } from "../datatypes/cwe";
import { mapTs } from "../datatypes/date-time";
import { mapXcn } from "../datatypes/xcn";
import type { MappingCitation } from "../mapping-guide";
import {
  observationInterpretation,
  observationInterpretationUnmatched,
  observationStatus,
  observationStatusUnmatched,
} from "../terminology/concept-maps";
import { absentElement, type AbsentReason, absentReason } from "./absent";
import { orderEffective } from "./effective";
import type { ObservationValue, ValueElement } from "./observation-value";
import { field, fieldLocation, repetitions, type SegmentAt } from "./segment";
import { joinedLines, joinedText, type TextDelimiters } from "./text";

/** The rows of the guide's maps that the Observation carries. */
export const observationCitations: readonly MappingCitation[] = [
  {
    conceptMap: "segment-obx-to-observation",
    rows: [
      "OBX-3",
      "OBX-5",
      "OBX-6",
      "OBX-7",
      "OBX-8",
      "OBX-11",
      "OBX-14",
      "OBX-16",
      "OBX-17",
    ],
  },
];

/** The statuses whose observation has no value, with the reason. */
const absentByStatus: ReadonlyMap<string, AbsentReason> = new Map([
  ["X", "not-performed"],
  ["N", "not-asked"],
]);

/** The statuses without equivalent that are no mistake: those the guide leaves unmatched and those handled above. */
const statusesWithoutEquivalent: ReadonlySet<string> = new Set([
  ...observationStatusUnmatched,
  ...absentByStatus.keys(),
]);

/** What an Observation is mapped from besides its segments. */
export interface ObservationLinks {
  /** The fullUrl of the Patient, if there is one. */
  readonly subject: string | undefined;
  /** The fullUrl of the Encounter, if there is one. */
  readonly encounter: string | undefined;
  /** The separators of free text, for the notes. */
  readonly delimiters: TextDelimiters;
  /** The OBR of the order, if the observation is part of one; its time stands in for an empty OBX-14. */
  readonly order: SegmentAt | undefined;
}

/**
 * Maps an OBX segment, its value (see `mapObservationValue`) and the NTE segments of its OBSERVATION group to an
 * Observation.
 */
export function mapObservation(
  context: MappingContext,
  obx: SegmentAt,
  value: ObservationValue,
  notes: readonly SegmentAt[],
  { subject, encounter, delimiters, order }: ObservationLinks,
): Observation {
  const statusCode = text(context, field(obx, 11));
  const code = observationCode(context, obx);
  const withheld =
    statusCode === undefined ? undefined : absentByStatus.get(statusCode);
  const interpretation = repetitions(obx, 8)
    .map((source) =>
      mapCode(context, source, observationInterpretation, {
        unmatched: observationInterpretationUnmatched,
      }),
    )
    .filter((coding) => coding !== undefined)
    .map((coding): CodeableConcept => ({ coding: [{ ...coding }] }));
  const performer = repetitions(obx, 16)
    .map((source) => mapXcn(context, source))
    .filter((reference) => reference !== undefined);
  const annotations = notes
    .map((nte) => joinedLines(context, repetitions(nte, 3), delimiters))
    .filter((note) => note !== undefined)
    .map((note): Annotation => ({ text: note }));
  const range = joinedText(context, field(obx, 7), delimiters);
  const observed: ObservationValue =
    withheld === undefined ? value : { kind: "absent", reason: withheld };
  return {
    resourceType: "Observation",
    status: status(context, obx, statusCode),
    code,
    ...compact({
      subject: subject === undefined ? undefined : { reference: subject },
      encounter: encounter === undefined ? undefined : { reference: encounter },
      ...effective(context, obx, order),
      performer: nonEmpty(performer),
    }),
    ...valueElements(observed),
    ...compact({
      interpretation: nonEmpty(interpretation),
      note: nonEmpty(annotations),
      method: mapCwe(context, field(obx, 17)),
      referenceRange: range === undefined ? undefined : [{ text: range }],
      component: components(observed, code),
    }),
  };
}

/**
 * Whether a result status (OBX-11) says the observation has no result to show: withdrawn or deleted (the statuses the
 * guide maps to `entered-in-error`), cancelled, or one of the statuses of {@link absentByStatus}.
 */
export function withholdsResult(status: string): boolean {
  const mapped = observationStatus(status);
  return (
    absentByStatus.has(status) ||
    mapped === "entered-in-error" ||
    mapped === "cancelled"
  );
}

/** The status of OBX-11 by the rules at the top of this module. */
function status(
  context: MappingContext,
  obx: SegmentAt,
  code: string | undefined,
): Observation["status"] {
  if (code === undefined) {
    reportIssue(context, "REQUIRED_ELEMENT_DEFAULTED", fieldLocation(obx, 11));
    return "unknown";
  }
  return (
    mapCode(context, field(obx, 11), observationStatus, {
      unmatched: statusesWithoutEquivalent,
    }) ?? "unknown"
  );
}

/** The time of the observation (OBX-14), else the time of its order (see the module comment). */
function effective(
  context: MappingContext,
  obx: SegmentAt,
  order: SegmentAt | undefined,
): Pick<Observation, "effectiveDateTime" | "effectivePeriod"> {
  const own = mapTs(context, field(obx, 14));
  if (own !== undefined) return { effectiveDateTime: own };
  return order === undefined ? {} : orderEffective(context, order);
}

/** The code of OBX-3, or an element with the reason why it is absent. */
function observationCode(
  context: MappingContext,
  obx: SegmentAt,
): CodeableConcept {
  const code = mapCwe(context, field(obx, 3));
  if (code !== undefined) return code;
  reportIssue(context, "REQUIRED_ELEMENT_DEFAULTED", fieldLocation(obx, 3));
  return absentElement("unknown");
}

/** The value or data-absent-reason of the observation; none when its values are components. */
function valueElements(
  value: ObservationValue,
): ValueElement & Pick<Observation, "dataAbsentReason"> {
  switch (value.kind) {
    case "value":
      return value.value;
    case "absent":
      return { dataAbsentReason: absentReason(value.reason) };
    case "none":
    case "attachments":
    case "components":
      return {};
  }
}

/** The components of repeated values, each with the code of the observation (the guide's map for repeating OBX-5). */
function components(
  value: ObservationValue,
  code: CodeableConcept,
): ObservationComponent[] | undefined {
  if (value.kind !== "components") return undefined;
  return value.values.map((element): ObservationComponent =>
    typeof element === "string"
      ? { code, dataAbsentReason: absentReason(element) }
      : { code, ...element },
  );
}
