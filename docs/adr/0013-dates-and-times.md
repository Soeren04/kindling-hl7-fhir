# 0013. Dates and times

- Status: accepted
- Date: 2026-10-10
- Implementation: partial (the rules are implemented in `src/fhir/datatypes/date-time.ts` and
  `src/fhir/date-time-parse.ts`; the resource mappers of phase 3, which choose the target type of each element,
  follow)

## Context

HL7 v2 dates and times are `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]` (DTM, and TS.1 in v2.5.1), `YYYY[MM[DD]]`
(DT) and `HH[MM[SS[.S...]]][+/-ZZZZ]` (TM). Any precision is allowed and the offset is optional; HL7 says a missing
offset means the sender's local time, which the message does not state. FHIR R4
([datatypes](https://hl7.org/fhir/R4/datatypes.html)) is stricter:

- `dateTime` is a year, year-month or date, or a date with a time that has seconds and an offset (`Z` or `+hh:mm`).
- `instant` is always a date with a time to the second and an offset.
- `date` has no time; `time` has seconds and no offset.
- Years start at 0001.

The guide's maps for TS and DTM only say that the value "must be converted" ([ADR 0012](0012-mapping-source-and-fhir-types.md)).
A converter that fills in `Z` for a missing offset produces valid FHIR that is wrong by the sender's offset from UTC,
silently, in every time of a message; for a medication time or a result time that is a clinical error.

## Decision

The rules, applied by `mapTs` (TS, DTM), `mapDt` (DT), `mapTm` (TM) and `mapDr` (DR) and checked by property tests
that every output matches the FHIR format of its type:

1. **TS.1 only.** TS.2, the deprecated degree of precision, is ignored; the precision is the one TS.1 is written in.
2. **The offset**, for a value with a time of day, is the value's own; else the offset of MSH-7, the time of the
   message, as the sender's clock; else the `timezone` option (`+01:00`, `Z`). An offset that the value does not
   carry is reported (`DATE_TIME_OFFSET_ASSUMED`, info), because it is borrowed: it is the offset in effect for the
   message or the option, which can differ from the one in effect at the time of the value when daylight saving time
   started or ended in between, and a fixed `timezone` applies the same offset to every value of a year.
3. **No offset found:** a `dateTime` keeps its date and loses its time, an `instant` is left out, because an instant
   without its time is no instant; both are `DATE_TIME_OFFSET_MISSING` (warning), which the `timezone` option avoids.
   An `instant` that is a date only has no time to give and is `DATE_TIME_OMITTED` (warning).
4. **Hour or minute precision** (`2024011510`) is filled with zeros to the second, because FHIR cannot write a shorter
   time (`DATE_TIME_PRECISION_ADJUSTED`, info). The value then claims a precision the sender did not, which is why it
   is reported.
5. **Dates** keep their precision (`2024`, `2024-01`, `2024-01-15`) and need no offset; an offset on a value without a
   time is dropped, as FHIR has no place for it and it does not change the day as written.
6. **A `date` target** (such as `Patient.birthDate` from a TS) takes the date as written and reports a dropped time
   (`DATE_TIME_TRUNCATED`, info, because the element is a date by design); converting to UTC first could change the
   day.
7. **TM to `time`** fills to seconds as in rule 4 and drops an offset (`TIME_OFFSET_DROPPED`, warning): FHIR `time`
   has none, and converting would need a date.
8. **Invalid values** (`20240230`, year 0000, a malformed offset) are left out with the error the validator reports
   for them: `INVALID_DATE_TIME`, `INVALID_DATE` or `INVALID_TIME`. Fractions of a second are kept as written. A
   leap second (`235960`) is invalid too, consistent with the validator, although FHIR's patterns accept a second 60:
   a converter that accepted it would produce times that the library's own validation rejects when read back.
9. **Every issue** names the value in `Issue.value` and locates TS.1, so a user sees which field lost what.

Values are read by the validator's scanners (`src/hl7v2/validate/formats.ts`) and then sliced at fixed positions; no
regular expression runs on message content.

## Alternatives considered

- **Assume UTC** (what several converters do). Valid output, wrong by hours, and nothing tells the user.
- **Assume the local time zone of the machine running the conversion.** The result would depend on where the code
  runs (a browser in Berlin, a server in UTC) and differ between test and production.
- **Keep a time without offset anyway.** FHIR's regular expression for `dateTime` rejects it; the official validator
  fails the bundle.
- **IANA time zone names for the `timezone` option** (`Europe/Berlin`). The offset would depend on each value's date
  (daylight saving time), which needs the time zone database of `Intl` and makes results depend on its version. A
  fixed offset covers the common case; an IANA option can be added later without breaking the fixed one.
- **Read TS.2.** It is deprecated since v2.3 and its precision contradicts TS.1 when both are sent.

## Consequences

- No time is converted to another offset, and an offset is only added where the message or the caller names one and
  an issue says so; a message without offsets yields dates and issues until the caller sets `timezone`, which the
  issue message points to. A borrowed offset can be wrong by the hour of a daylight saving time change, which is why
  every use of one is reported.
- Minute-precision times become second-precision times, visible as an info issue.
- `Bundle.timestamp` (an instant, from MSH-7) is left out for messages without offset and without `timezone`.
