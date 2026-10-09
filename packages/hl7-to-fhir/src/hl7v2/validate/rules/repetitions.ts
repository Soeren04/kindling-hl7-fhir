import { report } from "../../../shared/collect";
import { locate, type SegmentRule } from "../rule";

/** No field repeats more often than its definition allows. */
export const repetitions: SegmentRule = {
  name: "repetitions",
  summary:
    "No field repeats more often than its definition allows; a field that does not repeat has one repetition. Empty repetitions between others count.",
  codes: ["TOO_MANY_REPETITIONS"],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const { position, maxRepetitions } of context.definition.fields) {
      if (maxRepetitions === "unbounded") continue;
      const excess =
        context.segment.fields[position - 1]?.repetitions[maxRepetitions];
      if (excess !== undefined) {
        const location = locate(context, excess.span, {
          field: position,
          repetition: maxRepetitions + 1,
        });
        report(issues, "TOO_MANY_REPETITIONS", location);
      }
    }
  },
};
