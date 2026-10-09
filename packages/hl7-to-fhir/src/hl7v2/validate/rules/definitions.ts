import type { RuleDescription } from "../rule";

/** What `validate` and `group` check of the segment definitions passed in. */
export const definitions: RuleDescription = {
  name: "definitions",
  summary:
    "Every segment definition passed in `options.segments` has the shape `defineSegment` returns, which `defineSegment` itself ensures by throwing. A definition built another way that does not have it is reported and ignored.",
  codes: ["INVALID_DEFINITION"],
  scope: "every message",
};
