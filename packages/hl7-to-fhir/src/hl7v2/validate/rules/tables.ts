import { report } from "../../../shared/collect";
import { codeTables } from "../../definitions/code-tables";
import { locate, type SegmentRule } from "../rule";
import { hasFormat } from "../value-formats";
import { walkValues } from "../values";

/**
 * The tables of message codes (0076), trigger events (0003) and message structures (0354). HL7 reserves the codes
 * that start with Z for locally defined messages and events (HL7 v2.5.1 chapter 2, "Local extension"), so such a
 * code is not looked up there.
 */
const tablesWithLocalCodes: ReadonlySet<string> = new Set([
  "0003",
  "0076",
  "0354",
]);

/** Every coded value whose field or component names a shipped table is one of its codes. */
export const tables: SegmentRule = {
  name: "tables",
  summary:
    "Every value of a field or component that refers to one of the shipped HL7 tables (0001, 0003, 0004, 0076, 0085, 0104, 0123, 0203, 0354) is a code of that table. A code missing from an HL7-defined table is an error; a site may add codes to a user-defined table, so a code missing there is a warning. Codes starting with Z in the tables of message codes, trigger events and message structures (0076, 0003, 0354) are locally defined messages and are not looked up. A table on a coded composite field, such as a CE, applies to its first component. Values that fail their format are not looked up.",
  codes: ["UNKNOWN_CODE", "UNKNOWN_USER_DEFINED_CODE"],
  scope: "version 2.5 and caller definitions",
  check(context, issues) {
    for (const part of walkValues(context)) {
      if (part.kind !== "value" || part.table === undefined) continue;
      const table = codeTables.get(part.table);
      const { value, span } = part.subcomponent;
      const local =
        tablesWithLocalCodes.has(part.table) && value.startsWith("Z");
      if (
        table === undefined ||
        local ||
        table.codes.has(value) ||
        !hasFormat(part.dataType, value)
      ) {
        continue;
      }
      const code =
        table.kind === "hl7-defined"
          ? "UNKNOWN_CODE"
          : "UNKNOWN_USER_DEFINED_CODE";
      report(issues, code, locate(context, span, part.position), value);
    }
  },
};
