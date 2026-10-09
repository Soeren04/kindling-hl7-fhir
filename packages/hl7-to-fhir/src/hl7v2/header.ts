// The layout of the header segments, which the parser needs before it can split anything: the MSH segment, whose MSH-1
// and MSH-2 declare the delimiters, MSH-12 the version and MSH-18 the character set, and the count of the batch
// trailers. Every offset and field number of that layout is defined here and nowhere else.
import type { Issue, Span } from "../shared/issue";
import { report } from "../shared/collect";
import { type Charset, resolveCharset } from "./charset";
import { indexOfOrEnd } from "./input";
import type { Delimiters } from "./model";

/** The identifier of the message header segment. */
export const headerSegmentId = "MSH";

/** The length of every segment identifier (`MSH`, `PID`, `ZPI`); the field separator follows right after it. */
export const segmentIdLength = 3;

/** MSH-1, the field separator, which is the character right after the segment identifier. */
export const fieldSeparatorField = 1;

/** MSH-2, the encoding characters, which declare the other delimiters. */
export const encodingCharactersField = 2;

/** The first field of MSH that is split into repetitions and components; MSH-1 and MSH-2 are single values. */
export const firstSplitHeaderField = 3;

/** MSH-12, the version ID, which decides whether MSH-2 may declare a truncation character. */
export const versionField = 12;

/** MSH-18, the character set, which decides how hexadecimal escape sequences are decoded. */
export const characterSetField = 18;

/** The number of the first field of every segment. */
export const firstFieldNumber = 1;

/** `BTS-1` and `FTS-1`, the counts of messages and batches. */
export const trailerCountField = 1;

/**
 * Whether `character` may serve as a delimiter: a single printable ASCII character that is neither a letter nor a
 * digit. Letters and digits would be ambiguous with content, and whitespace or control characters would collide with
 * segment terminators and the whitespace the parser trims.
 */
export function isDelimiterCharacter(character: string): boolean {
  if (character.length !== 1) return false;
  const code = character.charCodeAt(0);
  const printable = code >= 0x21 && code <= 0x7e;
  const digit = code >= 0x30 && code <= 0x39;
  const letter =
    (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  return printable && !digit && !letter;
}

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
  const start = msh.start + segmentIdLength + 1;
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
  let start = msh.start + segmentIdLength + 1;
  for (let field = encodingCharactersField; field < fieldNumber; field++) {
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

/**
 * Reads MSH-18 and reports a character set named in a spelling HL7 table 0211 does not use.
 *
 * @param input - The whole input.
 * @param msh - The span of the MSH segment, without its terminator.
 * @param delimiters - The delimiters declared by the segment.
 * @param issues - Receives `NON_STANDARD_CHARACTER_SET`.
 */
export function readCharset(
  input: string,
  msh: Span,
  delimiters: Delimiters,
  issues: Issue[],
): Charset {
  const span = findHeaderValue(input, msh, delimiters, characterSetField);
  const name = span && input.slice(span.start, span.end);
  const { charset, nonStandard } = resolveCharset(name);
  if (span !== undefined && nonStandard) {
    const location = {
      span,
      segmentIndex: 0,
      segmentId: headerSegmentId,
      field: characterSetField,
    };
    report(issues, "NON_STANDARD_CHARACTER_SET", location, name);
  }
  return charset;
}

/**
 * Reports a segment after the first that starts like an MSH segment: a second message that `splitBatch` should have
 * split off. It is kept as a segment of this message, read with the delimiters of the first MSH, which is an error
 * when it declares other ones.
 *
 * @param input - The whole input.
 * @param span - The span of the segment, without its terminator.
 * @param segmentIndex - The position of the segment in the message.
 * @param declaration - The span of `MSH`, MSH-1 and MSH-2 of the first segment.
 * @param issues - Receives `UNEXPECTED_MSH` or `UNEXPECTED_MSH_DELIMITERS`.
 */
export function checkLaterHeader(
  input: string,
  span: Span,
  segmentIndex: number,
  declaration: Span,
  issues: Issue[],
): void {
  const startsHeader =
    input.startsWith(headerSegmentId, span.start) &&
    (span.end - span.start === segmentIdLength ||
      isDelimiterCharacter(input.charAt(span.start + segmentIdLength)));
  if (!startsHeader) return;
  const declared = input.slice(declaration.start, declaration.end);
  const afterDeclaration = span.start + declared.length;
  const sameDelimiters =
    input.startsWith(declared, span.start) &&
    (afterDeclaration === span.end ||
      input.charAt(afterDeclaration) === declared.charAt(segmentIdLength));
  report(
    issues,
    sameDelimiters ? "UNEXPECTED_MSH" : "UNEXPECTED_MSH_DELIMITERS",
    {
      span: { start: span.start, end: span.start + segmentIdLength },
      segmentIndex,
      segmentId: headerSegmentId,
    },
  );
}

/** The separator HL7 v2 messages use for components unless a header declares another. */
export const defaultComponentSeparator = "^";

/**
 * The component separator an `FHS` or `BHS` segment declares: the first of its encoding characters, which follow the
 * field separator as in MSH, or {@link defaultComponentSeparator} when that is no delimiter.
 *
 * @param input - The whole input.
 * @param segment - The span of the envelope header segment, without its terminator; it starts with its identifier.
 */
export function declaredComponentSeparator(
  input: string,
  segment: Span,
): string {
  const separatorStart = segment.start + segmentIdLength;
  const start = separatorStart + 1;
  const component = input.slice(start, Math.min(start + 1, segment.end));
  return isDelimiterCharacter(component) &&
    component !== input.charAt(separatorStart)
    ? component
    : defaultComponentSeparator;
}

/**
 * The span of the count in a batch or file trailer (`BTS-1`, `FTS-1`): the first component of the first field, up to
 * the next field or component separator. The field separator is the character after the identifier, like in MSH.
 *
 * @param input - The whole input.
 * @param trailer - The span of the trailer segment, without its terminator; it starts with its identifier.
 * @param component - The component separator of the header the trailer closes.
 */
export function trailerCountSpan(
  input: string,
  trailer: Span,
  component: string,
): Span {
  const separator = input.charAt(trailer.start + segmentIdLength);
  const start = trailer.start + segmentIdLength + 1;
  return {
    start,
    end: Math.min(
      indexOfOrEnd(input, separator, start, trailer.end),
      indexOfOrEnd(input, component, start, trailer.end),
    ),
  };
}
