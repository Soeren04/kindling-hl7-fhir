import type { Issue } from "../../../shared/issue";
import { report } from "../../../shared/collect";
import { emptySpanAt } from "../../../shared/span";
import { hasBuiltInDefinitions } from "../../definitions/version";
import { headerSegmentId, versionField } from "../../header";
import type { Hl7Message } from "../../model";
import type { RuleDescription } from "../rule";

/** Which messages the built-in definitions, written for version 2.5.1, apply to. */
export const version: RuleDescription = {
  name: "version",
  summary:
    "The built-in message structure, segment, data type and table definitions are those of version 2.5.1 and apply to messages whose MSH-12 is 2.5 or 2.5.x, or is empty (a missing MSH-12 is reported as a required field). For every other version the message structure is resolved and the segments are grouped, but neither their order nor their fields are checked against 2.5.1, because segments, fields, types and tables differ between versions; only the segment definitions passed in are checked.",
  codes: ["UNSUPPORTED_VERSION"],
  scope: "every message",
};

/**
 * Whether the built-in definitions apply to the message, reporting `UNSUPPORTED_VERSION` at MSH-12 when they do not.
 *
 * @param message - The message.
 * @param issues - Receives `UNSUPPORTED_VERSION`.
 */
export function checkVersion(message: Hl7Message, issues: Issue[]): boolean {
  const { version: id } = message;
  if (hasBuiltInDefinitions(id)) return true;
  // The version is read from MSH-12, so a message from `parse` has that field; a hand-built tree may not.
  const header = message.segments[0];
  const field =
    header?.id === headerSegmentId
      ? header.fields[versionField - 1]
      : undefined;
  const location =
    field === undefined
      ? { span: emptySpanAt(0) }
      : {
          span: field.span,
          segmentIndex: 0,
          segmentId: headerSegmentId,
          field: versionField,
        };
  report(issues, "UNSUPPORTED_VERSION", location, id);
  return false;
}
