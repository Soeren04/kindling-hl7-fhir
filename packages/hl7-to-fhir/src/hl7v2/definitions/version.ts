// Which messages the built-in definitions describe. The segments, data types, tables and message structures in this
// directory are those of HL7 v2.5.1; fields were renumbered, types changed and segments added in other versions.

/**
 * Whether the built-in definitions apply to a message whose MSH-12 is `version`: 2.5 or 2.5.x, or no version at all,
 * which `validate` reports as a missing required field of MSH.
 */
export function hasBuiltInDefinitions(version: string | undefined): boolean {
  return (
    version === undefined || version === "2.5" || version.startsWith("2.5.")
  );
}
