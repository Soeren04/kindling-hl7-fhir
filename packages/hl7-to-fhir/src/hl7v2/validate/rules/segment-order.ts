import type { RuleDescription } from "../rule";

/** What the matching of the segments against the message structure checks. */
export const segmentOrder: RuleDescription = {
  name: "segment-order",
  summary:
    "The segments follow the abstract message syntax of the structure: required segments and groups are present, no segment comes before one that must precede it, and none occurs more often than allowed. A segment that is present is never reported as missing: one that would make a required segment that occurs later look missing is reported as out of order instead. A segment the structure does not contain is a warning unless a definition is passed for it; an undefined Z segment is a note. No segment is dropped, whatever the version.",
  codes: [
    "SEGMENT_MISSING",
    "SEGMENT_OUT_OF_ORDER",
    "SEGMENT_REPEATED",
    "UNEXPECTED_SEGMENT",
    "UNDEFINED_Z_SEGMENT",
  ],
  scope: "version 2.5",
};
