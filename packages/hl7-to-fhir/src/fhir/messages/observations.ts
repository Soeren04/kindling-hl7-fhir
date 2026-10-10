// The OBX segments of a message to Observations, or, for encapsulated data in a result message, to attachments of
// the report (R4 Observation has no valueAttachment; see ../resources/observation-value.ts).
//
// An attachment carries only the data and the name of the observation it replaces (OBX-3), so the rest of the OBX is
// checked before it is dropped:
// - A result the status (OBX-11) says was withdrawn, deleted or could not be obtained (`W`, `D`, `X`, `N`) is no
//   content of the report: its data is left out (ATTACHMENT_LEFT_OUT).
// - Any other status than final, and the notes of the observation (NTE), have no place in
//   DiagnosticReport.presentedForm: they are reported (ATTACHMENT_DETAIL_DROPPED) instead of dropped silently.
import type { Attachment } from "fhir/r4";

import { type MappingContext, reportIssue, text } from "../context";
import { mapCwe } from "../datatypes/cwe";
import { mapObservation, withholdsResult } from "../resources/observation";
import { mapObservationValue } from "../resources/observation-value";
import {
  field,
  fieldLocation,
  segmentLocation,
  type SegmentAt,
} from "../resources/segment";
import type { MappedEntry, MessageMapping } from "./mapping";

/** An OBX segment and the NTE segments that comment on it. */
export interface ObservationSegments {
  readonly obx: SegmentAt;
  readonly notes: readonly SegmentAt[];
}

/** The resources the observations link to, and the order they are part of. */
export interface ObservationContext {
  readonly subject: string | undefined;
  readonly encounter: string | undefined;
  /**
   * The OBR of the order of the observations, if they are part of one: its report takes their encapsulated data, and
   * its time stands in for an empty OBX-14.
   */
  readonly order: SegmentAt | undefined;
}

/** The Observations of the OBX segments, in message order, and the attachments for the report. */
export interface MappedObservations {
  readonly entries: readonly MappedEntry[];
  readonly attachments: readonly Attachment[];
}

/** Maps OBX segments to Observations and, in a report, encapsulated data to attachments. */
export function mapObservations(
  mapping: MessageMapping,
  observations: readonly ObservationSegments[],
  { subject, encounter, order }: ObservationContext,
): MappedObservations {
  const { context, delimiters, nextUrl, markMapped } = mapping;
  const entries: MappedEntry[] = [];
  const attachments: Attachment[] = [];
  for (const { obx, notes } of observations) {
    markMapped(obx);
    for (const nte of notes) markMapped(nte);
    const value = mapObservationValue(context, obx, {
      inReport: order !== undefined,
      delimiters,
    });
    if (value.kind === "attachments") {
      attachments.push(
        ...reportAttachments(context, obx, notes, value.attachments),
      );
      continue;
    }
    const fullUrl = nextUrl(obx);
    const resource = mapObservation(context, obx, value, notes, {
      subject,
      encounter,
      delimiters,
      order,
    });
    entries.push({ fullUrl, resource, source: obx });
  }
  return { entries, attachments };
}

/** The attachments of an OBX for its report, named by the observation, as far as its status allows them. */
function reportAttachments(
  context: MappingContext,
  obx: SegmentAt,
  notes: readonly SegmentAt[],
  attachments: readonly Attachment[],
): readonly Attachment[] {
  const status = text(context, field(obx, 11));
  if (status !== undefined && withholdsResult(status)) {
    reportIssue(context, "ATTACHMENT_LEFT_OUT", fieldLocation(obx, 11), status);
    return [];
  }
  if (status !== undefined && status !== "F") {
    reportIssue(
      context,
      "ATTACHMENT_DETAIL_DROPPED",
      fieldLocation(obx, 11),
      status,
    );
  }
  for (const nte of notes) {
    reportIssue(context, "ATTACHMENT_DETAIL_DROPPED", segmentLocation(nte));
  }
  const code = mapCwe(context, field(obx, 3));
  const title = code?.text ?? code?.coding?.[0]?.display;
  return title === undefined
    ? attachments
    : attachments.map((attachment) => ({ ...attachment, title }));
}
