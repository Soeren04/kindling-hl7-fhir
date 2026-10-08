import type { Span } from "../shared/issue";
import type { Delimiters } from "./model";

/** The delimiters needed to find a value in the MSH segment. */
type HeaderDelimiters = Pick<Delimiters, "field" | "repetition" | "component">;

/**
 * Reads the raw text of MSH-`fieldNumber`, first repetition, first component, straight from the input.
 *
 * Some header values must be known before the rest of the message can be interpreted: the version (MSH-12) decides
 * whether MSH-2 may declare a truncation character, and the character set (MSH-18) decides how hexadecimal escape
 * sequences are decoded. They are plain identifiers, so they are returned without unescaping.
 *
 * @param input - The whole input.
 * @param msh - The span of the MSH segment, without its terminator.
 * @param delimiters - The delimiters declared by the segment.
 * @param fieldNumber - The field number, 3 or greater.
 * @returns The raw text, or `undefined` when it is empty or the segment has no such field.
 */
export function readHeaderValue(
  input: string,
  msh: Span,
  delimiters: HeaderDelimiters,
  fieldNumber: number,
): string | undefined {
  // MSH-2 starts after "MSH" and the field separator; each further field separator starts the next field.
  let start = msh.start + 4;
  for (let field = 2; field < fieldNumber; field++) {
    start = indexOfOrEnd(input, delimiters.field, start, msh.end) + 1;
    if (start > msh.end) return undefined;
  }
  let end = start;
  while (end < msh.end && !endsHeaderValue(input.charAt(end), delimiters)) {
    end++;
  }
  return end > start ? input.slice(start, end) : undefined;
}

function endsHeaderValue(
  character: string,
  delimiters: HeaderDelimiters,
): boolean {
  return (
    character === delimiters.field ||
    character === delimiters.repetition ||
    character === delimiters.component
  );
}

/**
 * Finds `character` in `input` between `from` and `end`.
 *
 * Unlike `String.prototype.indexOf`, the search stops at `end`, so looking for a field inside one segment never
 * scans the rest of the message.
 *
 * @returns The offset of the character, or `end` when it does not occur in the range.
 */
export function indexOfOrEnd(
  input: string,
  character: string,
  from: number,
  end: number,
): number {
  let index = from;
  while (index < end && input.charAt(index) !== character) index++;
  return index;
}
