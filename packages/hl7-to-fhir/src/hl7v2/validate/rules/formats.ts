import { report } from "../../../shared/collect";
import { locate, type SegmentRule } from "../rule";
import { valueFormats } from "../value-formats";
import { walkValues } from "../values";

/** Every value of a primitive type with a format has that format. */
export const formats: SegmentRule = {
  name: "formats",
  summary:
    "Every value of a type with a format has it: NM numbers, SI sequence IDs, DT dates, DTM date-times (also TS.1), TM times, and ID and IS codes without surrounding whitespace or control characters. Dates and times must exist; offsets are at most 14 hours. OBX-5 is checked as the type OBX-2 names. Text lengths are not checked.",
  codes: [
    "INVALID_NUMBER",
    "INVALID_SEQUENCE_ID",
    "INVALID_DATE",
    "INVALID_DATE_TIME",
    "INVALID_TIME",
    "MALFORMED_CODE",
  ],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const part of walkValues(context)) {
      if (part.kind !== "value") continue;
      const format = valueFormats.get(part.dataType);
      const { value, span } = part.subcomponent;
      if (format !== undefined && !format.isValid(value)) {
        const location = locate(context, span, part.position);
        report(issues, format.code, location, value);
      }
    }
  },
};
