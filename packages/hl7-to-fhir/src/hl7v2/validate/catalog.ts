// Every validation rule with its description, in the order `validate` applies them. The documentation's table of
// rules and issue codes is generated from this list, so it cannot drift from the code.
import type { RuleDescription } from "./rule";
import { definitions } from "./rules/definitions";
import { messageShape } from "./rules/message-shape";
import { messageStructure } from "./rules/message-structure";
import { segmentOrder } from "./rules/segment-order";
import { segmentRules } from "./rules/segment-rules";
import { version } from "./rules/version";

/** The validation rules in the order `validate` applies them. */
export const validationRules: readonly RuleDescription[] = [
  messageShape,
  definitions,
  messageStructure,
  version,
  segmentOrder,
  ...segmentRules,
];
