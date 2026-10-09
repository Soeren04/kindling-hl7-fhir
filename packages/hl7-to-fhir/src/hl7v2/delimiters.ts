import { type Issue, type Location, type Span } from "../shared/issue";
import { issue, type IssueOf } from "../shared/issue-table";
import { report } from "../shared/collect";
import { err, ok, type Result } from "../shared/result";
import {
  encodingCharactersField,
  encodingCharactersSpan,
  fieldSeparatorField,
  findHeaderValue,
  headerSegmentId,
  isDelimiterCharacter,
  segmentIdLength,
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
const encodingPosition = {
  component: 0,
  repetition: 1,
  escape: 2,
  subcomponent: 3,
  truncation: 4,
} as const;
const minEncodingCharacters = encodingPosition.repetition + 1;
const maxEncodingCharacters = encodingPosition.truncation + 1;

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
  issues: Issue[],
): Result<DelimiterReading, DelimiterFailure> {
  const separatorStart = msh.start + segmentIdLength;
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
        mshLocation(fieldSeparatorField, separatorSpan),
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
        mshLocation(encodingCharactersField, encodingSpan),
        encoding,
      ),
    );
  }

  const escape = encoding.charAt(encodingPosition.escape);
  const subcomponent = encoding.charAt(encodingPosition.subcomponent);
  const delimiters: Delimiters = {
    field,
    component: encoding.charAt(encodingPosition.component),
    repetition: encoding.charAt(encodingPosition.repetition),
    ...(escape === "" ? {} : { escape }),
    ...(subcomponent === "" ? {} : { subcomponent }),
  };
  if (subcomponent === "") {
    report(
      issues,
      "ENCODING_CHARACTERS_OMITTED",
      mshLocation(encodingCharactersField, encodingSpan),
      encoding,
    );
  }
  const reading = { delimiters, encoding: encodingSpan };
  if (encoding.length < maxEncodingCharacters) return ok(reading);

  const truncation = encoding.charAt(encodingPosition.truncation);
  const version = findHeaderValue(input, msh, delimiters, versionField);
  if (declaresTruncation(version && input.slice(version.start, version.end))) {
    return ok({ ...reading, delimiters: { ...delimiters, truncation } });
  }
  const truncationSpan = { start: encodingSpan.end - 1, end: encodingSpan.end };
  report(
    issues,
    "TRUNCATION_CHARACTER_IGNORED",
    mshLocation(encodingCharactersField, truncationSpan),
    truncation,
  );
  return ok(reading);
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
  return { span, segmentIndex: 0, segmentId: headerSegmentId, field };
}
