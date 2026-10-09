import { versionField } from "./header";
import type { Segment } from "./model";

/**
 * The version ID of a message (`Hl7Message.version`): the decoded value of the first subcomponent of the first
 * component of the first repetition of MSH-12, or `undefined` when that position holds no text.
 *
 * Reading it from the tree, not from the raw header text, makes the version a function of the tree: `stringify` can
 * check it, and a written tree reads back with the same version.
 *
 * @param header - The MSH segment.
 */
export function versionOf(header: Segment | undefined): string | undefined {
  const subcomponent =
    header?.fields[versionField - 1]?.repetitions[0]?.components[0]
      ?.subcomponents[0];
  return subcomponent?.kind === "value" && subcomponent.value !== ""
    ? subcomponent.value
    : undefined;
}
