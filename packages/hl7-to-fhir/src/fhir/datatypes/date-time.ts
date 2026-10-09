// Dates and times: TS and DTM to dateTime, instant or date, DT to date, TM to time, DR to Period.
//
// FHIR needs what HL7 v2 may leave out: a time of day in a dateTime has seconds and an offset from UTC, an instant
// always has both, and a time has seconds but no offset. The rules, in order:
// - TS.1 is read and TS.2 (degree of precision, deprecated) is ignored; TS.1 is a DTM, so one mapper serves both.
// - The offset is the value's own, else the one of MSH-7, else the `timezone` option; a borrowed offset is reported
//   (`DATE_TIME_OFFSET_ASSUMED`). With none, a time of day is cut to its date (dateTime) or the value is left out
//   (instant), reported as `DATE_TIME_OFFSET_MISSING`: an offset is never invented.
// - A time that stops at the hour or minute is filled with zeros to the second, with an issue.
// - A value that is not a valid date or time is left out with the error the validator reports for it.
import type { Period } from "fhir/r4";

import type { IssueCode } from "../../shared/issue";
import { compact } from "../compact";
import { type MappingContext, present, reportIssue, text } from "../context";
import {
  type DateTimeParts,
  parseDate,
  parseDateTime,
  parseTime,
} from "../date-time-parse";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";

/** The FHIR type a date and time maps to. */
export type DateTimeTarget = "dateTime" | "instant" | "date";

/** The guide's maps for TS and DTM: TS.1, a DTM, becomes the value; TS.2 is not mapped. */
export const tsCitations: readonly MappingCitation[] = [
  { conceptMap: "datatype-ts-to-datetime", rows: ["TS.1"] },
  { conceptMap: "datatype-dtm-to-datetime", rows: ["DTM.1"] },
];

/** The guide's map for DR: both ends become the period. */
export const drCitation: MappingCitation = {
  conceptMap: "datatype-dr-to-period",
  rows: ["DR.1", "DR.2"],
};

/**
 * Maps a TS or DTM to a FHIR `dateTime` (the default), `instant` or `date`, following the rules at the top of this
 * module; `undefined` when there is nothing to map or the value cannot be made valid.
 */
export function mapTs(
  context: MappingContext,
  source: Source | undefined,
  target: DateTimeTarget = "dateTime",
): string | undefined {
  const first = part(present(context, source), 1);
  const value = text(context, first);
  if (first === undefined || value === undefined) return undefined;
  const parts = parseDateTime(value);
  if (parts === undefined) {
    reportIssue(context, "INVALID_DATE_TIME", first.location, value);
    return undefined;
  }
  const report = (code: IssueCode): void => {
    reportIssue(context, code, first.location, value);
  };
  const { date, time } = parts;
  if (target === "date") {
    if (time !== undefined) report("DATE_TIME_TRUNCATED");
    return date;
  }
  if (time === undefined) {
    // An instant is a moment, which a date is not.
    if (target !== "instant") return date;
    report("DATE_TIME_OMITTED");
    return undefined;
  }
  const offset = parts.offset ?? context.messageOffset ?? context.timezone;
  if (offset === undefined) {
    report("DATE_TIME_OFFSET_MISSING");
    return target === "instant" ? undefined : date;
  }
  if (parts.offset === undefined) report("DATE_TIME_OFFSET_ASSUMED");
  if (time.filled) report("DATE_TIME_PRECISION_ADJUSTED");
  return `${date}T${clock(time)}${offset}`;
}

/** Maps a DT to a FHIR `date`; `undefined` when there is nothing to map or the value is not a date. */
export function mapDt(
  context: MappingContext,
  source: Source | undefined,
): string | undefined {
  const value = text(context, source);
  if (source === undefined || value === undefined) return undefined;
  const date = parseDate(value);
  if (date === undefined) {
    reportIssue(context, "INVALID_DATE", source.location, value);
  }
  return date;
}

/** Maps a TM to a FHIR `time`, without its offset; `undefined` when there is nothing to map or it is not a time. */
export function mapTm(
  context: MappingContext,
  source: Source | undefined,
): string | undefined {
  const value = text(context, source);
  if (source === undefined || value === undefined) return undefined;
  const parts = parseTime(value);
  if (parts === undefined) {
    reportIssue(context, "INVALID_TIME", source.location, value);
    return undefined;
  }
  if (parts.time.filled) {
    reportIssue(
      context,
      "DATE_TIME_PRECISION_ADJUSTED",
      source.location,
      value,
    );
  }
  if (parts.offset !== undefined) {
    reportIssue(context, "TIME_OFFSET_DROPPED", source.location, value);
  }
  return clock(parts.time);
}

/** Maps a DR to a FHIR `Period` of two dateTimes; `undefined` when neither end maps. */
export function mapDr(
  context: MappingContext,
  source: Source | undefined,
): Period | undefined {
  const range = present(context, source);
  return period(mapTs(context, part(range, 1)), mapTs(context, part(range, 2)));
}

/** A period of the given ends, or `undefined` when it has neither. */
export function period(
  start: string | undefined,
  end: string | undefined,
): Period | undefined {
  return start === undefined && end === undefined
    ? undefined
    : compact({ start, end });
}

/** A time of day as FHIR writes it, with its fraction of a second. */
function clock({ time, fraction }: NonNullable<DateTimeParts["time"]>): string {
  return fraction === undefined ? time : `${time}.${fraction}`;
}
