import { report } from "../../../shared/collect";
import { isPopulated } from "../populated";
import { locate, type SegmentRule } from "../rule";

/** No field that the definition does not have, or marks as not used, holds anything. */
export const unexpectedFields: SegmentRule = {
  name: "unexpected-fields",
  summary:
    "No field after the last one the segment definition has, and no field it marks as not used (optionality X), holds anything; such a field is often a sign of a field separator in a value or of a later version of the segment.",
  codes: ["UNEXPECTED_FIELD"],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const [index, field] of context.segment.fields.entries()) {
      // Definitions number their fields from 1 in order, so field `index + 1` is at `index`.
      const definition = context.definition.fields[index];
      const unexpected =
        definition === undefined || definition.optionality === "X";
      if (unexpected && isPopulated(field)) {
        const location = locate(context, field.span, { field: index + 1 });
        report(issues, "UNEXPECTED_FIELD", location);
      }
    }
  },
};
