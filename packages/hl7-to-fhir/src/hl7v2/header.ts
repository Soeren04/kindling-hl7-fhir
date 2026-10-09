// The layout of the MSH segment, which the parser needs before it can split anything: MSH-1 and MSH-2 declare the
// delimiters, MSH-12 the version and MSH-18 the character set. Every offset and field number of that layout is
// defined here and nowhere else.
import type { Span } from "../shared/issue";
import { indexOfOrEnd } from "./input";
import type { Delimiters } from "./model";

/** Offset of MSH-1, the field separator, from the start of the segment: right after `MSH`. */
export const fieldSeparatorOffset = 3;

/** MSH-12, the version ID, which decides whether MSH-2 may declare a truncation character. */
export const versionField = 12;

/** MSH-18, the character set, which decides how hexadecimal escape sequences are decoded. */
export const characterSetField = 18;

/**
 * The span of MSH-2, the encoding characters: from after the field separator to the next field separator or the end
 * of the segment.
 *
 * @param input - The whole input.
 * @param msh - The span of an MSH segment without its terminator; it holds at least `MSH` and the field separator.
 * @param field - The field separator of the segment.
 */
export function encodingCharactersSpan(
  input: string,
  msh: Span,
  field: string,
): Span {
  const start = msh.start + fieldSeparatorOffset + 1;
  return { start, end: indexOfOrEnd(input, field, start, msh.end) };
}

/** The delimiters needed to find a value in the MSH segment. */
type HeaderDelimiters = Pick<Delimiters, "field" | "repetition" | "component">;

/**
 * Finds the raw text of MSH-`fieldNumber`, first repetition, first component, straight in the input.
 *
 * Some header values must be known before the rest of the message can be interpreted (see {@link versionField} and
 * {@link characterSetField}). They are plain identifiers, so their raw text is used without unescaping.
 *
 * @param input - The whole input.
 * @param msh - The span of the MSH segment, without its terminator.
 * @param delimiters - The delimiters declared by the segment.
 * @param fieldNumber - The field number, 3 or greater.
 * @returns The span of the text, or `undefined` when it is empty or the segment has no such field.
 */
export function findHeaderValue(
  input: string,
  msh: Span,
  delimiters: HeaderDelimiters,
  fieldNumber: number,
): Span | undefined {
  // MSH-2 starts after the field separator; each further field separator starts the next field.
  let start = msh.start + fieldSeparatorOffset + 1;
  for (let field = 2; field < fieldNumber; field++) {
    start = indexOfOrEnd(input, delimiters.field, start, msh.end) + 1;
    if (start > msh.end) return undefined;
  }
  let end = start;
  while (end < msh.end && !endsHeaderValue(input.charAt(end), delimiters)) {
    end++;
  }
  return end > start ? { start, end } : undefined;
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
