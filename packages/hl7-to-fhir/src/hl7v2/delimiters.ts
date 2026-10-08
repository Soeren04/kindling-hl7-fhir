import type { Issue, Location, Span } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { indexOfOrEnd, readHeaderValue } from "./header";
import type { Delimiters } from "./model";

/** The delimiters of a message and the remarks made while reading them. */
export interface DelimiterReading {
  /** The delimiters, with standard values for those MSH-2 omits. */
  readonly delimiters: Delimiters;
  /** Remarks about MSH-1 and MSH-2, such as defaulted delimiters. */
  readonly issues: readonly Issue[];
}

/** The standard delimiters `|^~\&`, used for the characters a shortened MSH-2 omits. */
const standard = {
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
} as const;

/** Offset of MSH-1 in the segment: right after "MSH". */
const fieldSeparatorOffset = 3;

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
 * @returns The delimiters with remarks, or the error issue explaining why they cannot be used.
 */
export function readDelimiters(
  input: string,
  msh: Span,
): Result<DelimiterReading, Issue> {
  const separatorStart = msh.start + fieldSeparatorOffset;
  const field = input.slice(
    separatorStart,
    Math.min(separatorStart + 1, msh.end),
  );
  if (!isDelimiterCharacter(field)) {
    return err(invalidFieldSeparator(field, separatorStart, msh.end));
  }

  const encodingSpan = {
    start: separatorStart + 1,
    end: indexOfOrEnd(input, field, separatorStart + 1, msh.end),
  };
  const encoding = input.slice(encodingSpan.start, encodingSpan.end);
  const problem = findEncodingProblem(encoding);
  if (problem !== undefined) {
    return err({
      code: "INVALID_ENCODING_CHARACTERS",
      severity: "error",
      message: problem,
      location: mshLocation(2, encodingSpan),
      value: encoding,
    });
  }

  const delimiters: Delimiters = {
    field,
    component: encoding.charAt(0),
    repetition: encoding.charAt(1) || standard.repetition,
    escape: encoding.charAt(2) || standard.escape,
    subcomponent: encoding.charAt(3) || standard.subcomponent,
  };
  const { component, repetition, escape, subcomponent } = delimiters;
  const declared = [field, component, repetition, escape, subcomponent];
  if (!areDistinct([...declared, encoding.charAt(4)])) {
    return err({
      code: "INVALID_ENCODING_CHARACTERS",
      severity: "error",
      message:
        "The field separator, the encoding characters in MSH-2 and the standard values of omitted encoding characters must all be different.",
      location: mshLocation(2, encodingSpan),
      value: encoding,
    });
  }

  const issues: Issue[] = [];
  if (encoding.length < 4) {
    issues.push({
      code: "ENCODING_CHARACTERS_DEFAULTED",
      severity: "warning",
      message:
        "MSH-2 declares fewer than four encoding characters; the omitted ones take their standard values.",
      location: mshLocation(2, encodingSpan),
      value: encoding,
    });
  }
  if (encoding.length < maxEncodingCharacters)
    return ok({ delimiters, issues });

  const truncation = encoding.charAt(4);
  if (declaresTruncation(readHeaderValue(input, msh, delimiters, 12))) {
    return ok({ delimiters: { ...delimiters, truncation }, issues });
  }
  issues.push({
    code: "TRUNCATION_CHARACTER_IGNORED",
    severity: "warning",
    message:
      "MSH-2 declares a truncation character, which only versions 2.7 and later define; it has no special meaning in this message.",
    location: mshLocation(2, {
      start: encodingSpan.end - 1,
      end: encodingSpan.end,
    }),
    value: truncation,
  });
  return ok({ delimiters, issues });
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

function invalidFieldSeparator(
  field: string,
  start: number,
  segmentEnd: number,
): Issue {
  const location = mshLocation(1, {
    start,
    end: Math.min(start + 1, segmentEnd),
  });
  return field === ""
    ? {
        code: "INVALID_FIELD_SEPARATOR",
        severity: "error",
        message: "The MSH segment ends before MSH-1, the field separator.",
        location,
      }
    : {
        code: "INVALID_FIELD_SEPARATOR",
        severity: "error",
        message:
          "MSH-1, the field separator, must be a printable ASCII character that is neither a letter nor a digit.",
        location,
        value: field,
      };
}

function findEncodingProblem(encoding: string): string | undefined {
  if (encoding.length === 0 || encoding.length > maxEncodingCharacters) {
    return "MSH-2 must contain one to five encoding characters.";
  }
  return Array.from({ length: encoding.length }, (_, index) =>
    encoding.charAt(index),
  ).every(isDelimiterCharacter)
    ? undefined
    : "The encoding characters in MSH-2 must be printable ASCII characters that are neither letters nor digits.";
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
