import type { Component, Field, Repetition, Subcomponent } from "../model";

/**
 * Whether a node holds anything: a value or the explicit null `""` in any of its subcomponents. A field of empty
 * repetitions, components and subcomponents (`~^&`) holds nothing.
 */
export function isPopulated(
  node: Field | Repetition | Component | Subcomponent | undefined,
): boolean {
  if (node === undefined) return false;
  // The recursion follows the four levels of the tree below a segment, never the length of the input.
  if ("repetitions" in node) return node.repetitions.some(isPopulated);
  if ("components" in node) return node.components.some(isPopulated);
  if ("subcomponents" in node) return node.subcomponents.some(isPopulated);
  return node.kind !== "empty";
}
