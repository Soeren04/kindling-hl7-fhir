import type { RuleDescription } from "../rule";

/** What `validate` and `group` check before anything else. */
export const messageShape: RuleDescription = {
  name: "message-shape",
  summary:
    "The message has the shape of the tree `parse` returns, with a valid span on every node. A tree built in plain JavaScript with a missing node, a node of the wrong type or a node without a valid span yields this one issue and nothing else.",
  codes: ["INVALID_TREE"],
  scope: "every message",
};
