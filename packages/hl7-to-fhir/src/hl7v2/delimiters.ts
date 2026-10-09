import {
  issue,
  type IssueOf,
  type LocatedIssue,
  type Location,
  report,
  type Span,
} from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import {
  encodingCharactersSpan,
  fieldSeparatorOffset,
  findHeaderValue,
  versionField,
} from "./header";
import type { Delimiters } from "./model";

/** The delimiters of a message and where MSH-2 declares them. */
export interface DelimiterReading {
  /** The delimiters; those MSH-2 omits are absent. */
  readonly delimiters: Delimiters;
  /** The span of MSH-2, the encoding characters. */
  readonly encoding: Span;
}

/** Why the delimiters cannot be used. */
export type DelimiterFailure = IssueOf<
  "INVALID_FIELD_SEPARATOR" | "INVALID_ENCODING_CHARACTERS"
>;

// MSH-2 lists, by position, the component, repetition, escape and subcomponent delimiters and, from version 2.7, the
// truncation character. The first two are required; the escape character "may be omitted if no escape characters
// are used", the subcomponent separator "if not used, may be omitted" (HL7 v2.5.1 section 2.5.4).
const minEncodingCharacters = 2;
const maxEncodingCharacters = 5;

/**
 * Reads the delimiters from MSH-1 and MSH-2.
 *
 * MSH-2 has two to five characters. Omitted escape and subcomponent delimiters are left out, with an info issue: the
 * message does not use them. A fifth character is the truncation marker in version 2.7 and later (MSH-12); in older
 * versions it is ignored with a warning. Every delimiter must be a printable ASCII punctuation character, and all must
 * be distinct.
 *
 * @param input - The whole input.
 * @param msh - The span of the MSH segment without its terminator; the input must start with `MSH` there.
 * @param issues - Receives the issues about MSH-2 that do not stop parsing, such as omitted delimiters.
 * @returns The delimiters, or the error issue explaining why they cannot be used.
 */
export function readDelimiters(
  input: string,
  msh: Span,
  issues: LocatedIssue[],
): Result<DelimiterReading, DelimiterFailure> {
  const separatorStart = msh.start + fieldSeparatorOffset;
  // Bounded by the segment: "MSH" alone has no field separator, whatever character follows it in the input.
  const separatorSpan = {
    start: separatorStart,
    end: Math.min(separatorStart + 1, msh.end),
  };
  const field = input.slice(separatorSpan.start, separatorSpan.end);
  if (!isDelimiterCharacter(field)) {
    return err(
      issue(
        "INVALID_FIELD_SEPARATOR",
        mshLocation(1, separatorSpan),
        field || undefined,
      ),
    );
  }

  const encodingSpan = encodingCharactersSpan(input, msh, field);
  const encoding = input.slice(encodingSpan.start, encodingSpan.end);
  const valid =
    encoding.length >= minEncodingCharacters &&
    encoding.length <= maxEncodingCharacters &&
    allDelimiterCharacters(encoding) &&
    allDistinct(field + encoding);
  if (!valid) {
    return err(
      issue(
        "INVALID_ENCODING_CHARACTERS",
        mshLocation(2, encodingSpan),
        encoding,
      ),
    );
  }

  const escape = encoding.charAt(2);
  const subcomponent = encoding.charAt(3);
  const delimiters: Delimiters = {
    field,
    component: encoding.charAt(0),
    repetition: encoding.charAt(1),
    ...(escape === "" ? {} : { escape }),
    ...(subcomponent === "" ? {} : { subcomponent }),
  };
  if (subcomponent === "") {
    report(
      issues,
      "ENCODING_CHARACTERS_OMITTED",
      mshLocation(2, encodingSpan),
      encoding,
    );
  }
  const reading = { delimiters, encoding: encodingSpan };
  if (encoding.length < maxEncodingCharacters) return ok(reading);

  const truncation = encoding.charAt(4);
  const version = findHeaderValue(input, msh, delimiters, versionField);
  if (declaresTruncation(version && input.slice(version.start, version.end))) {
    return ok({ ...reading, delimiters: { ...delimiters, truncation } });
  }
  const truncationSpan = { start: encodingSpan.end - 1, end: encodingSpan.end };
  report(
    issues,
    "TRUNCATION_CHARACTER_IGNORED",
    mshLocation(2, truncationSpan),
    truncation,
  );
  return ok(reading);
}

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

function allDelimiterCharacters(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (!isDelimiterCharacter(text.charAt(index))) return false;
  }
  return true;
}

function allDistinct(text: string): boolean {
  for (let index = 1; index < text.length; index++) {
    if (text.lastIndexOf(text.charAt(index), index - 1) !== -1) return false;
  }
  return true;
}

// A version starts with a major and a minor number of decimal digits ("2.7", "2.8.2", "2.10"). Anchored and free of
// backtracking, so "2.0x7", "2.1e1" or "Infinity" are not read as numbers the way Number() would.
const versionNumbers = /^(\d+)\.(\d+)/u;

/**
 * Whether a message of this version (MSH-12.1) may declare a truncation character, which version 2.7 introduced.
 * An absent or unreadable version is treated as older.
 */
function declaresTruncation(version: string | undefined): boolean {
  const match = versionNumbers.exec(version ?? "");
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 7);
}

function mshLocation(field: number, span: Span): Location {
  return { span, segmentIndex: 0, segmentId: "MSH", field };
}
