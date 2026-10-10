import { expect } from "vitest";

import {
  createMappingContext,
  type MappingContext,
} from "../../../src/fhir/context";
import type { SegmentAt } from "../../../src/fhir/resources/segment";
import type { Hl7Message } from "../../../src/hl7v2/model";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../../hl7v2/helpers";
import { type MappingOptions, settingsOf } from "../helpers";

/** What a resource mapper test needs: the segments after the MSH, a context and the issues reported to it. */
export interface SegmentsMapping {
  readonly message: Hl7Message;
  /** The segment at `index` of the message; the MSH is 0, the first segment passed in is 1. */
  readonly at: (index: number) => SegmentAt;
  readonly context: MappingContext;
  readonly issues: Issue[];
}

/**
 * A segment with the given fields at their positions and the others empty: `segment("PID", { 3: "12345" })` is
 * `PID|||12345`.
 */
export function segment(
  id: string,
  fields: Readonly<Record<number, string>>,
): string {
  const last = Math.max(0, ...Object.keys(fields).map(Number));
  const values = Array.from(
    { length: last },
    (_, index) => new Map(Object.entries(fields)).get(String(index + 1)) ?? "",
  );
  return [id, ...values].join("|");
}

/**
 * Parses `segments` after a standard MSH (sent at `options.sent`) and returns them with a fresh context.
 *
 * @param segments - The segments after the MSH, such as `["PID|1||12345"]`.
 */
export function segmentsMapping(
  segments: readonly string[],
  { sent = "20240115103000+0100", settings = {} }: MappingOptions = {},
): SegmentsMapping {
  const header = `MSH|^~\\&|LAB|HOSP|EHR|HOSP|${sent}||ADT^A01^ADT_A01|MSG00001|P|2.5.1`;
  const { message } = parsed([header, ...segments].join("\r"));
  const issues: Issue[] = [];
  const context = createMappingContext(message, settingsOf(settings), issues);
  return {
    message,
    at: (index) => {
      const segment = message.segments[index];
      if (segment === undefined) expect.fail(`no segment at ${String(index)}`);
      return { segment, segmentIndex: index };
    },
    context,
    issues,
  };
}
