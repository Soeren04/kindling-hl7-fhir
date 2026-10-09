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
  /** The delimiters, with standard values for those MSH-2 omits. */
  readonly delimiters: Delimiters;
  /** The span of MSH-2, the encoding characters. */
  readonly encoding: Span;
}

/** Why the delimiters cannot be used. */
export type DelimiterFailure = IssueOf<
  "INVALID_FIELD_SEPARATOR" | "INVALID_ENCODING_CHARACTERS"
>;

/** The standard delimiters `|^~\&`, used for the characters a shortened MSH-2 omits. */
const standard = {
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
} as const;

/** MSH-2 holds component, repetition, escape and subcomponent delimiters, and from version 2.7 a truncation marker. */
const maxEncodingCharacters = 5;

/**
 * Reads the delimiters from MSH-1 and MSH-2.
 *
 * MSH-2 may have one to five characters. Omitted delimiters take their standard values (with a warning). A fifth
 * character is the truncation marker in version 2.7 and later (MSH-12); in older versions it is ignored with a
 * warning. Every delimiter must be a printable ASCII punctuation character, and all must be distinct.
 *
 * @param input - The whole input.
 * @param msh - The span of the MSH segment without its terminator; the input must start with `MSH` there.
 * @param issues - Receives the warnings about MSH-2, such as defaulted delimiters.
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
  const delimiters: Delimiters = {
    field,
    component: encoding.charAt(0),
    repetition: encoding.charAt(1) || standard.repetition,
    escape: encoding.charAt(2) || standard.escape,
    subcomponent: encoding.charAt(3) || standard.subcomponent,
  };
  const { component, repetition, escape, subcomponent } = delimiters;
  const valid =
    encoding.length > 0 &&
    encoding.length <= maxEncodingCharacters &&
    allDelimiterCharacters(encoding) &&
    areDistinct([
      field,
      component,
      repetition,
      escape,
      subcomponent,
      encoding.charAt(4),
    ]);
  if (!valid) {
    return err(
      issue(
        "INVALID_ENCODING_CHARACTERS",
        mshLocation(2, encodingSpan),
        encoding,
      ),
    );
  }

  if (encoding.length < 4) {
    report(
      issues,
      "ENCODING_CHARACTERS_DEFAULTED",
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

function areDistinct(characters: readonly string[]): boolean {
  const present = characters.filter((character) => character !== "");
  return new Set(present).size === present.length;
}

/**
 * Whether a message of this version (MSH-12.1) may declare a truncation character, which version 2.7 introduced.
 * An absent or unreadable version is treated as older.
 */
function declaresTruncation(version: string | undefined): boolean {
  const [major = Number.NaN, minor = Number.NaN] = (version ?? "")
    .split(".", 2)
    .map(Number);
  return major > 2 || (major === 2 && minor >= 7);
}

function mshLocation(field: number, span: Span): Location {
  return { span, segmentIndex: 0, segmentId: "MSH", field };
}
