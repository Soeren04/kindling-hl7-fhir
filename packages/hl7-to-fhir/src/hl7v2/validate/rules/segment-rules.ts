import type { SegmentRule } from "../rule";
import { components } from "./components";
import { formats } from "./formats";
import { repetitions } from "./repetitions";
import { requiredFields } from "./required-fields";
import { tables } from "./tables";
import { unexpectedFields } from "./unexpected-fields";

/** The rules that check one segment at a time against its definition, in the order they run. */
export const segmentRules: readonly SegmentRule[] = [
  requiredFields,
  repetitions,
  unexpectedFields,
  components,
  formats,
  tables,
];
