import type { Span } from "./issue";

/**
 * The empty span at `position`, which locates something that has no text of its own: a segment or field that is
 * missing where it belongs, or the end of the input.
 */
export function emptySpanAt(position: number): Span {
  return { start: position, end: position };
}
