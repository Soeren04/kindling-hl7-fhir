// The formats of the HL7 v2.5.1 primitive data types that have one (HL7 v2.5.1 section 2.A), checked by scanning the
// characters once: no regular expression ever runs on a value, so a long value costs time linear in its length.

/**
 * Whether `text` is a number (NM): an optional leading `+` or `-`, at least one digit, and at most one decimal point
 * anywhere among the digits.
 *
 * HL7 v2.5.1 (chapter 2A, data type NM) describes a number as ASCII digits with an optional leading sign and an
 * optional decimal point, and requires no digit on either side of the point, so `.5` and `5.` are numbers. A sign
 * or a point alone has no digit and is not.
 */
export function isNumber(text: string): boolean {
  const start = text.startsWith("+") || text.startsWith("-") ? 1 : 0;
  let digits = 0;
  let points = 0;
  for (let index = start; index < text.length; index++) {
    const character = text.charAt(index);
    if (isDigit(text, index)) digits++;
    else if (character === ".") points++;
    else return false;
  }
  return digits > 0 && points <= 1;
}

/** Whether `text` is a sequence ID (SI): a non-negative whole number, written with digits only. */
export function isSequenceId(text: string): boolean {
  return text.length > 0 && allDigits(text, 0, text.length);
}

/** Whether `text` is a date (DT): `YYYY[MM[DD]]`, with a month and a day that exist. */
export function isDate(text: string): boolean {
  return isCalendarDate(text, text.length);
}

/**
 * Whether `text` is a date and time (DTM, also the first component of TS):
 * `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`, with a date that exists, a time of day that exists and an offset
 * of at most 14 hours.
 */
export function isDateTime(text: string): boolean {
  const end = offsetStart(text);
  if (end <= dateLength) return isCalendarDate(text, end);
  return isCalendarDate(text, dateLength) && isTimeOfDay(text, dateLength, end);
}

/**
 * Whether `text` is a time (TM): `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`, with a time of day that exists and an offset of
 * at most 14 hours.
 */
export function isTime(text: string): boolean {
  return isTimeOfDay(text, 0, offsetStart(text));
}

/**
 * Whether `text` has the shape of a coded value (ID or IS): not empty, no whitespace at either end and no control
 * characters, so that it can match a table entry. Spaces inside are allowed, as in `UNICODE UTF-8`.
 */
export function isCode(text: string): boolean {
  if (text.length === 0) return false;
  const last = text.length - 1;
  for (let index = 0; index <= last; index++) {
    const code = text.charCodeAt(index);
    const control = code < 0x20 || code === 0x7f;
    const blankAtEnd = (index === 0 || index === last) && code === 0x20;
    if (control || blankAtEnd) return false;
  }
  return true;
}

/** The characters of `YYYYMMDD`. */
const dateLength = 8;

/** The characters of an offset: a sign and `HHMM`. */
const offsetLength = 5;

/** The largest offset FHIR accepts, 14 hours, which also bounds the offsets on Earth. */
const maximumOffsetHours = 14;

/**
 * Where the date or time before the offset ends: at the offset (`+HHMM` or `-HHMM`) when there is a valid one at the
 * end of `text`, and otherwise at the end of `text`, whose sign, if any, then fails the digit checks. An offset that
 * is malformed or out of range makes the whole value invalid, so it yields -1.
 */
function offsetStart(text: string): number {
  const start = text.length - offsetLength;
  const sign = text.charAt(start);
  if (start < 0 || (sign !== "+" && sign !== "-")) return text.length;
  const hours = digitsAt(text, start + 1, 2);
  const minutes = digitsAt(text, start + 3, 2);
  const valid =
    hours !== undefined &&
    minutes !== undefined &&
    minutes < 60 &&
    (hours < maximumOffsetHours ||
      (hours === maximumOffsetHours && minutes === 0));
  return valid ? start : -1;
}

/** Whether `text.slice(0, end)` is `YYYY`, `YYYYMM` or `YYYYMMDD` with a month and a day that exist. */
function isCalendarDate(text: string, end: number): boolean {
  const year = digitsAt(text, 0, 4);
  if (year === undefined || (end !== 4 && end !== 6 && end !== dateLength)) {
    return false;
  }
  if (end === 4) return true;
  const month = digitsAt(text, 4, 2);
  if (month === undefined || month < 1 || month > 12) return false;
  if (end === 6) return true;
  const day = digitsAt(text, 6, 2);
  return day !== undefined && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Whether `text.slice(start, end)` is `HH`, `HHMM`, `HHMMSS` or `HHMMSS` followed by a decimal point and one to four
 * digits, within the hours, minutes and seconds of a day.
 */
function isTimeOfDay(text: string, start: number, end: number): boolean {
  const limits = [24, 60, 60];
  let position = start;
  for (const limit of limits) {
    const value = digitsAt(text, position, 2);
    if (value === undefined || value >= limit || position + 2 > end) {
      return false;
    }
    position += 2;
    if (position === end) return true;
  }
  const fraction = end - position - 1;
  return (
    text.charAt(position) === "." &&
    fraction >= 1 &&
    fraction <= 4 &&
    allDigits(text, position + 1, end)
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The number written by the `count` digits at `start`, or `undefined` when one of them is not a digit or missing. */
function digitsAt(
  text: string,
  start: number,
  count: number,
): number | undefined {
  if (start < 0 || start + count > text.length) return undefined;
  let value = 0;
  for (let index = start; index < start + count; index++) {
    if (!isDigit(text, index)) return undefined;
    value = value * 10 + text.charCodeAt(index) - 0x30;
  }
  return value;
}

function allDigits(text: string, start: number, end: number): boolean {
  for (let index = start; index < end; index++) {
    if (!isDigit(text, index)) return false;
  }
  return true;
}

function isDigit(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code >= 0x30 && code <= 0x39;
}
