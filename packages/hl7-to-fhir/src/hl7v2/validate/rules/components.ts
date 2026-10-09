import { report } from "../../../shared/collect";
import { locate, type SegmentRule } from "../rule";
import { walkValues } from "../values";

/** No component or subcomponent beyond those of the data type holds anything. */
export const components: SegmentRule = {
  name: "components",
  summary:
    "No component or subcomponent beyond those its data type defines holds anything; a primitive type has one of each. Such content is often a delimiter that should have been escaped, or a component a later version added.",
  codes: ["UNEXPECTED_COMPONENT"],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const part of walkValues(context)) {
      if (part.kind === "unexpected") {
        const location = locate(context, part.span, part.position);
        report(issues, "UNEXPECTED_COMPONENT", location);
      }
    }
  },
};
