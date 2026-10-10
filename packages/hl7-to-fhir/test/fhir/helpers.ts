import { expect } from "vitest";

import {
  createMappingContext,
  createMappingSettings,
  type MappingContext,
  type MappingSettings,
  type MappingSettingsOptions,
} from "../../src/fhir/context";
import { fieldValues, type Source } from "../../src/fhir/source";
import type { Issue, IssueCode } from "../../src/shared/issue";
import { parsed } from "../hl7v2/helpers";

/** What a mapper test needs: the values of one segment, a context and the issues reported to it. */
export interface Mapping {
  /** The whole message text, which the spans of the locations point into. */
  readonly input: string;
  /** Repetition `repetition` (1-based) of field `field` of the segment, as a mapper source. */
  readonly field: (field: number, repetition?: number) => Source | undefined;
  readonly context: MappingContext;
  readonly issues: Issue[];
}

/** Options of {@link mapping}: the message time (MSH-7) and the options of the conversion, as a caller writes them. */
export interface MappingOptions {
  readonly sent?: string;
  readonly settings?: MappingSettingsOptions;
}

/** The settings of the options, normalized as a conversion normalizes them; the options must be valid. */
function settingsOf(options: MappingSettingsOptions = {}): MappingSettings {
  const settings = createMappingSettings(options);
  if (!settings.ok) expect.fail(`invalid option ${settings.error.option}`);
  return settings.value;
}

/**
 * Parses `segment` as the segment after a standard MSH (at index 1) and returns its values with a fresh context.
 *
 * @param segment - One segment, such as `PID|1||12345^^^HOSP^MR`.
 */
export function mapping(
  segment: string,
  { sent = "", settings = {} }: MappingOptions = {},
): Mapping {
  const header = `MSH|^~\\&|LAB|HOSP|EHR|HOSP|${sent}||ADT^A01^ADT_A01|MSG00001|P|2.5.1`;
  const input = `${header}\r${segment}`;
  const { message } = parsed(input);
  const parsedSegment = message.segments[1];
  if (parsedSegment === undefined) expect.fail("expected a second segment");
  const issues: Issue[] = [];
  const context = createMappingContext(message, settingsOf(settings), issues);
  return {
    input,
    field: (field, repetition = 1) =>
      fieldValues(parsedSegment, 1, field)[repetition - 1],
    context,
    issues,
  };
}

/** The codes of the issues, in the order they were reported. */
export function codes(issues: readonly Issue[]): IssueCode[] {
  return issues.map(({ code }) => code);
}
