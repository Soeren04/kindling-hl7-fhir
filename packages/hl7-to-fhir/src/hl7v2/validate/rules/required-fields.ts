import { report } from "../../../shared/collect";
import { emptySpanAt } from "../../../shared/span";
import { isPopulated } from "../populated";
import { locate, type SegmentRule } from "../rule";

/** Every field whose optionality is `R` holds a value or the explicit null `""`. */
export const requiredFields: SegmentRule = {
  name: "required-fields",
  summary:
    'Every field the segment definition marks as required (optionality R) holds a value or the explicit null `""`.',
  codes: ["REQUIRED_FIELD_MISSING"],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const { position, optionality } of context.definition.fields) {
      const field = context.segment.fields[position - 1];
      if (optionality === "R" && !isPopulated(field)) {
        // A field the segment ends before belongs at its end.
        const span = field?.span ?? emptySpanAt(context.segment.span.end);
        const location = locate(context, span, { field: position });
        report(issues, "REQUIRED_FIELD_MISSING", location);
      }
    }
  },
};
