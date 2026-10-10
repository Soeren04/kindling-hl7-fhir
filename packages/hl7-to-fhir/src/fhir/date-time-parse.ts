// Reads the HL7 v2 date and time formats (DT, DTM and the first component of TS, TM) into the pieces FHIR writes
// them with. The formats are fixed-width, so once the validator's scanners accept a value, its pieces are slices at
// known positions; no regular expression runs on a value.
import { isDate, isDateTime, isTime } from "../hl7v2/validate/formats";
import { compact } from "./compact";

/** A time of day as FHIR writes it, from the hour on; absent pieces were not sent. */
interface TimeOfDay {
  /** `HH:MM:SS`, with zeros where the value stops before the minutes or seconds. */
  readonly time: string;
  /** The digits after the decimal point of the seconds, when the value has them. */
  readonly fraction?: string | undefined;
  /** Whether the value stops before the seconds, so zeros were filled in. */
  readonly filled: boolean;
}

/** An HL7 date and time (DTM) split into the pieces of a FHIR `dateTime`. */
export interface DateTimeParts {
  /** The date as FHIR writes it: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly date: string;
  /** The time of day, when the value has one (only after a full date). */
  readonly time?: TimeOfDay | undefined;
  /** The offset from UTC as FHIR writes it (`+01:00`), when the value has one. */
  readonly offset?: string | undefined;
}

/** An HL7 time (TM) split into the pieces of a FHIR `time`. */
export interface TimeParts {
  readonly time: TimeOfDay;
  /** The offset from UTC as FHIR writes it, when the value has one; FHIR `time` cannot hold it. */
  readonly offset?: string | undefined;
}

/** The characters of an HL7 offset: a sign and `HHMM`. */
const offsetLength = 5;

/**
 * Reads a date and time (`YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`), or `undefined` when the text is not one or
 * names a date FHIR cannot write: FHIR years start at 0001.
 *
 * @example
 * ```ts
 * parseDateTime("202401151030+0100");
 * // { date: "2024-01-15", time: { time: "10:30:00", filled: true }, offset: "+01:00" }
 * ```
 */
export function parseDateTime(text: string): DateTimeParts | undefined {
  if (!isDateTime(text) || text.startsWith("0000")) return undefined;
  const { body, offset } = splitOffset(text);
  const date = [body.slice(0, 4), body.slice(4, 6), body.slice(6, 8)]
    .filter((piece) => piece !== "")
    .join("-");
  return compact({
    date,
    time: body.length > 8 ? timeOfDay(body.slice(8)) : undefined,
    offset,
  });
}

/**
 * Reads a time (`HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`), or `undefined` when the text is not one.
 *
 * @example
 * ```ts
 * parseTime("1030"); // { time: { time: "10:30:00", filled: true } }
 * ```
 */
export function parseTime(text: string): TimeParts | undefined {
  if (!isTime(text)) return undefined;
  const { body, offset } = splitOffset(text);
  return compact({ time: timeOfDay(body), offset });
}

/**
 * Reads a date (`YYYY[MM[DD]]`) as a FHIR `date`, or `undefined` when the text is not one or names a year before
 * 0001.
 *
 * @example
 * ```ts
 * parseDate("198001"); // "1980-01"
 * ```
 */
export function parseDate(text: string): string | undefined {
  return isDate(text) ? parseDateTime(text)?.date : undefined;
}

/**
 * Reads a time zone given as a FHIR offset (`+01:00`, `-05:30`, `Z`), the form of the `timezone` option, or
 * `undefined` when the text is not one or exceeds the 14 hours FHIR allows.
 *
 * @example
 * ```ts
 * parseTimezone("+01:00"); // "+01:00"
 * parseTimezone("Europe/Berlin"); // undefined
 * ```
 */
export function parseTimezone(text: string): string | undefined {
  return timezone.test(text) ? text : undefined;
}

/** A FHIR offset: `Z`, or a sign and `HH:MM` of at most 14 hours. */
const timezone = /^(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u;

/** The text before an HL7 offset and the offset as FHIR writes it, if the (valid) text ends with one. */
function splitOffset(text: string): {
  body: string;
  offset: string | undefined;
} {
  const start = text.length - offsetLength;
  const sign = text.charAt(start);
  if (start < 0 || (sign !== "+" && sign !== "-")) {
    return { body: text, offset: undefined };
  }
  const offset = `${sign}${text.slice(start + 1, start + 3)}:${text.slice(start + 3)}`;
  return { body: text.slice(0, start), offset };
}

/** A valid HL7 time of day without offset (`HH[MM[SS[.S...]]]`) as FHIR writes it. */
function timeOfDay(text: string): TimeOfDay {
  const hour = text.slice(0, 2);
  const minute = text.slice(2, 4) || "00";
  const second = text.slice(4, 6) || "00";
  const fraction = text.slice(7);
  return compact({
    time: `${hour}:${minute}:${second}`,
    fraction: fraction === "" ? undefined : fraction,
    filled: text.length < 6,
  });
}
