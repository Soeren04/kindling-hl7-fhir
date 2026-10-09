import type { Location, Span } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { decodesAsciiBytes, resolveCharset } from "./charset";
import { readDelimiters } from "./delimiters";
import { type EncodeContext, encodeText } from "./escape";
import { characterSetField, findHeaderValue, versionField } from "./header";
import { mllpEndBlock } from "./input";
import type {
  Component,
  Delimiters,
  Field,
  Hl7Message,
  Repetition,
  Segment,
  Subcomponent,
} from "./model";
import { isValidSegmentId } from "./segment";
import { type StringifyFailure, stringifyFailure } from "./stringify-failure";
import { checkTree, spanOf } from "./tree-check";
import { versionOf } from "./version";

export type {
  StringifyFailure,
  StringifyFailureCode,
} from "./stringify-failure";

/**
 * Writes a message as HL7 v2 text: the inverse of `parse`.
 *
 * `parse(stringify(message))` yields the same tree, apart from its spans, which describe the new text, and from
 * empty nodes, which are written the way `parse` represents them:
 *
 * - Empty children at the end of a list are not written, as `parse` trims them. A value `""` that is not truncated
 *   (left by removed formatting commands) is written as nothing, so it reads back as an empty subcomponent, and a
 *   node whose children are all empty reads back without children.
 * - MSH-1 and MSH-2 are written from `message.delimiters`, the single source of truth; a tree without them gets
 *   them, one with others fails (`DELIMITERS_MISMATCH`).
 *
 * The output is canonical: every segment, the last one included, ends with a carriage return, and values are
 * escaped with the message delimiters. Line feeds are written as `\X0A\` (as `\.br\` in a character set without
 * hexadecimal escapes, and as they are, where they read back as data, in a message without escape character).
 * Segment identifiers are written as they are. A segment that would otherwise read back as a blank line or with an
 * MLLP end block at its end gets a trailing field separator, which reads back as nothing, and one whose identifier
 * starts with a line feed follows `\r\n` instead of `\r`, so the line feed does not join the terminator before it.
 *
 * Three things do not survive a round trip from text, because the tree no longer holds them: formatting commands that
 * `parse` removed from a value, the original spelling of escape sequences (`\X41\` is written as `A`), and the
 * terminators and framing of the input.
 *
 * Writing never throws. It fails instead of producing text that reads back differently (see
 * {@link StringifyFailureCode}): for a tree that does not have the shape of a message, and for one that holds what
 * its delimiters or character set cannot express, for example a value with a `|` in a message whose MSH-2 omits the
 * escape character. Trees returned by `parse` are written, except in two cases of malformed input described under
 * `DELIMITERS_MISMATCH` and `HEX_ESCAPE_UNSUPPORTED`.
 *
 * @param message - The message to write, usually from `parse`.
 * @returns The message text, or why it cannot be written.
 *
 * @example
 * ```ts
 * import { parse, stringify } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\nPID|1||12345||Everyman^Adam\n");
 * if (result.ok) {
 *   const text = stringify(result.value.message);
 *   if (text.ok) console.log(text.value);
 *   // "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam\r"
 * }
 * ```
 */
export function stringify(
  message: Hl7Message,
): Result<string, StringifyFailure> {
  const shape = checkTree(message);
  if (shape !== undefined) return err(shape);
  const [header, ...body] = message.segments;
  if (header?.id !== "MSH") {
    const at = header === undefined ? {} : { segmentIndex: 0 };
    return err(
      stringifyFailure("MISSING_MSH", { span: spanOf(header), ...at }),
    );
  }
  const written = writeHeader(message, header);
  if (!written.ok) return written;

  const { text, hexEscapes } = written.value;
  const parts = [text, "\r"];
  for (const [index, segment] of body.entries()) {
    // A line feed right after a carriage return would read as part of the terminator; after `\r\n` it is data.
    if (segment.id.startsWith("\n")) parts.push("\n");
    const writer = {
      delimiters: message.delimiters,
      hexEscapes,
      // Segments end with carriage returns, so a line feed after the first segment is data.
      lineFeedIsData: true,
      parts,
    };
    const failure = writeSegment(writer, segment, index + 1);
    if (failure !== undefined) return err(failure);
    parts.push("\r");
  }
  return concatenate(parts);
}

/** Where the text is written to, and what the text around a value allows. */
interface Writer extends EncodeContext {
  /** The pieces of text written so far, joined once at the end. */
  readonly parts: string[];
}

/** The MSH segment as text, and whether the hexadecimal escapes the rest of the message needs read back. */
interface WrittenHeader {
  readonly text: string;
  readonly hexEscapes: boolean;
}

/**
 * Writes the MSH segment and checks that it reads back with the delimiters and the version of the message.
 *
 * The character set that MSH-18 declares decides whether hexadecimal escapes read back, also in MSH itself. The
 * segment is written with them first; when the declared character set turns out to have none, it is written again
 * without. That cannot change MSH-18.1, as a character set name holds no character that needs an escape sequence.
 */
function writeHeader(
  message: Hl7Message,
  header: Segment,
): Result<WrittenHeader, StringifyFailure> {
  const { delimiters } = message;
  const at = { segmentIndex: 0, segmentId: "MSH" };
  if (message.version !== versionOf(header)) {
    const field = header.fields[versionField - 1];
    const span = spanOf(field, spanOf(header));
    return err(
      stringifyFailure("VERSION_MISMATCH", {
        span,
        ...at,
        field: versionField,
      }),
    );
  }
  let written = writeHeaderText(message, header, true);
  if (!written.ok) return written;
  const span = { start: 0, end: written.value.length };
  const name = findHeaderValue(
    written.value,
    span,
    delimiters,
    characterSetField,
  );
  const { charset } = resolveCharset(
    name && written.value.slice(name.start, name.end),
  );
  const hexEscapes = decodesAsciiBytes(charset);
  if (!hexEscapes) {
    written = writeHeaderText(message, header, false);
    if (!written.ok) return written;
  }
  const text = written.value;
  // MSH-2 is written as the tree holds it, and the version decides whether its fifth character is the truncation
  // character, so the delimiters are read back the way parse reads them.
  const declared = readDelimiters(text, { start: 0, end: text.length }, []);
  if (!declared.ok || !sameDelimiters(declared.value.delimiters, delimiters)) {
    const field = header.fields[1];
    const location = { span: spanOf(field, spanOf(header)), ...at, field: 2 };
    return err(stringifyFailure("DELIMITERS_MISMATCH", location));
  }
  return ok({ text, hexEscapes });
}

function writeHeaderText(
  message: Hl7Message,
  header: Segment,
  hexEscapes: boolean,
): Result<string, StringifyFailure> {
  const parts: string[] = [];
  const writer = {
    delimiters: message.delimiters,
    hexEscapes,
    lineFeedIsData: false,
    parts,
  };
  const failure = writeSegment(writer, header, 0);
  return failure === undefined ? concatenate(parts) : err(failure);
}

function sameDelimiters(a: Delimiters, b: Delimiters): boolean {
  return (
    a.field === b.field &&
    a.component === b.component &&
    a.repetition === b.repetition &&
    a.escape === b.escape &&
    a.subcomponent === b.subcomponent &&
    a.truncation === b.truncation
  );
}

/**
 * Joins the written pieces. This is the one place where the text grows to its full length, so the one place where it
 * can exceed the longest string the engine supports; joining strings fails with nothing but that `RangeError`.
 */
function concatenate(
  parts: readonly string[],
): Result<string, StringifyFailure> {
  try {
    return ok(parts.join(""));
  } catch {
    return err(stringifyFailure("OUTPUT_TOO_LARGE", { span: noSpan }));
  }
}

const noSpan: Span = { start: 0, end: 0 };

/** The structural part of a location; the numbers are 1-based. */
type Address = Omit<Location, "span">;

function writeSegment(
  writer: Writer,
  segment: Segment,
  segmentIndex: number,
): StringifyFailure | undefined {
  const { parts, delimiters } = writer;
  const start = parts.length;
  const address: Address = isValidSegmentId(segment.id)
    ? { segmentIndex, segmentId: segment.id }
    : { segmentIndex };
  parts.push(segment.id);
  // In MSH, fields[0] and fields[1] are MSH-1 and MSH-2: the delimiters themselves, written with the identifier.
  const header = segment.id === "MSH";
  if (header) {
    const failure = writeDelimiterFields(writer, segment, address);
    if (failure !== undefined) return failure;
  }
  const first = header ? 2 : 0;
  const length = writtenLength(segment.fields, isBlankField);
  for (const [index, field] of segment.fields.slice(first, length).entries()) {
    parts.push(delimiters.field);
    const failure = writeField(writer, field, {
      ...address,
      field: first + index + 1,
    });
    if (failure !== undefined) return failure;
  }
  // Without a character other than whitespace, the segment would read back as a blank line or be trimmed as trailing
  // whitespace, and an end block at its end would read as MLLP framing. A field separator after it reads back as an
  // empty last field, which parse trims.
  if (needsClosingSeparator(parts.slice(start))) parts.push(delimiters.field);
  return undefined;
}

/**
 * Writes MSH-1 and MSH-2, which are written as they are, never escaped. Both must be empty or a single value; MSH-1
 * must be the field separator, and MSH-2 must not contain what would end it. In the first MSH, an empty MSH-2 is
 * written from the delimiters; a later MSH, which `parse` reads as a second message kept in this one, keeps its own.
 */
function writeDelimiterFields(
  writer: Writer,
  segment: Segment,
  address: Address,
): StringifyFailure | undefined {
  const { delimiters, parts } = writer;
  const [separatorField, encodingField] = segment.fields;
  const separator = verbatimText(separatorField);
  if (
    separator === undefined ||
    (separator !== "" && separator !== delimiters.field)
  ) {
    const span = spanOf(separatorField, spanOf(segment));
    return stringifyFailure("DELIMITERS_MISMATCH", {
      span,
      ...address,
      field: 1,
    });
  }
  const encoding = verbatimText(encodingField);
  const first = address.segmentIndex === 0;
  // MSH-2 ends at the next field separator, and a carriage return would end the segment.
  const unwritable =
    encoding === undefined ||
    encoding.includes(delimiters.field) ||
    encoding.includes("\r");
  if (unwritable) {
    const span = spanOf(encodingField, spanOf(segment));
    return stringifyFailure("DELIMITERS_MISMATCH", {
      span,
      ...address,
      field: 2,
    });
  }
  if (first) {
    parts.push(delimiters.field, encoding || encodingCharacters(delimiters));
  } else if (segment.fields.length > 0) {
    parts.push(delimiters.field, encoding);
  }
  return undefined;
}

function encodingCharacters(delimiters: Delimiters): string {
  const {
    component,
    repetition,
    escape = "",
    subcomponent = "",
    truncation = "",
  } = delimiters;
  return component + repetition + escape + subcomponent + truncation;
}

/**
 * The text of a field that `parse` keeps as a single value (MSH-1, MSH-2): an empty string for an absent or empty
 * field, `undefined` for a field that is not a single value.
 */
function verbatimText(field: Field | undefined): string | undefined {
  if (field === undefined || field.repetitions.length === 0) return "";
  const [repetition] = field.repetitions;
  const [component] = repetition?.components ?? [];
  const [value] = component?.subcomponents ?? [];
  const single =
    field.repetitions.length === 1 &&
    repetition?.components.length === 1 &&
    component?.subcomponents.length === 1 &&
    value?.kind === "value" &&
    value.truncated !== true;
  return single ? value.value : undefined;
}

/** Whether the pieces of a segment hold no character but spaces, tabs and line feeds, or end in an MLLP end block. */
function needsClosingSeparator(pieces: readonly string[]): boolean {
  for (const piece of [...pieces].reverse()) {
    for (let index = piece.length - 1; index >= 0; index--) {
      const character = piece.charAt(index);
      if (character !== " " && character !== "\t" && character !== "\n") {
        return character === mllpEndBlock;
      }
    }
  }
  return true;
}

/** The number of nodes up to the last one that writes any text: parse trims the empty ones after it. */
function writtenLength<T>(
  nodes: readonly T[],
  isBlank: (node: T) => boolean,
): number {
  let length = nodes.length;
  for (const node of [...nodes].reverse()) {
    if (!isBlank(node)) break;
    length--;
  }
  return length;
}

function isBlankField(field: Field): boolean {
  return field.repetitions.every(isBlankRepetition);
}

function isBlankRepetition(repetition: Repetition): boolean {
  return repetition.components.every(isBlankComponent);
}

function isBlankComponent(component: Component): boolean {
  return component.subcomponents.every(isBlankSubcomponent);
}

function isBlankSubcomponent(subcomponent: Subcomponent): boolean {
  return (
    subcomponent.kind === "empty" ||
    (subcomponent.kind === "value" &&
      subcomponent.value === "" &&
      subcomponent.truncated !== true)
  );
}

/** Writes the nodes up to the last one with text, separated by `separator`. */
function writeList<T>(
  writer: Writer,
  nodes: readonly T[],
  isBlank: (node: T) => boolean,
  separator: string,
  writeNode: (node: T, number: number) => StringifyFailure | undefined,
): StringifyFailure | undefined {
  const length = writtenLength(nodes, isBlank);
  for (const [index, node] of nodes.slice(0, length).entries()) {
    if (index > 0) writer.parts.push(separator);
    const failure = writeNode(node, index + 1);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

function writeField(
  writer: Writer,
  field: Field,
  address: Address,
): StringifyFailure | undefined {
  return writeList(
    writer,
    field.repetitions,
    isBlankRepetition,
    writer.delimiters.repetition,
    (repetition, number) =>
      writeRepetition(writer, repetition, { ...address, repetition: number }),
  );
}

function writeRepetition(
  writer: Writer,
  repetition: Repetition,
  address: Address,
): StringifyFailure | undefined {
  return writeList(
    writer,
    repetition.components,
    isBlankComponent,
    writer.delimiters.component,
    (component, number) =>
      writeComponent(writer, component, { ...address, component: number }),
  );
}

function writeComponent(
  writer: Writer,
  component: Component,
  address: Address,
): StringifyFailure | undefined {
  const { subcomponents } = component;
  const writeOne = (subcomponent: Subcomponent, number: number) =>
    writeSubcomponent(writer, subcomponent, {
      ...address,
      subcomponent: number,
    });
  const separator = writer.delimiters.subcomponent;
  if (separator !== undefined) {
    return writeList(
      writer,
      subcomponents,
      isBlankSubcomponent,
      separator,
      writeOne,
    );
  }
  // Without a separator, only the first subcomponent can be written; the ones after it must be empty.
  if (writtenLength(subcomponents, isBlankSubcomponent) > 1) {
    const span = spanOf(component);
    return stringifyFailure("SUBCOMPONENT_SEPARATOR_REQUIRED", {
      span,
      ...address,
    });
  }
  const [first] = subcomponents;
  return first === undefined ? undefined : writeOne(first, 1);
}

function writeSubcomponent(
  writer: Writer,
  subcomponent: Subcomponent,
  address: Address,
): StringifyFailure | undefined {
  const location = { span: spanOf(subcomponent), ...address };
  const { delimiters, parts } = writer;
  switch (subcomponent.kind) {
    case "value": {
      const encoded = encodeText(subcomponent.value, writer);
      if (!encoded.ok) return stringifyFailure(encoded.error, location);
      parts.push(...encoded.value);
      if (subcomponent.truncated !== true) return undefined;
      // The marker goes after the escaped value, unescaped, where parse reads it as the truncation.
      if (delimiters.truncation === undefined) {
        return stringifyFailure("TRUNCATION_CHARACTER_REQUIRED", location);
      }
      parts.push(delimiters.truncation);
      return undefined;
    }
    case "null":
      if (Object.values(delimiters).includes('"')) {
        return stringifyFailure("NULL_NOT_REPRESENTABLE", location);
      }
      parts.push('""');
      return undefined;
    case "empty":
      return undefined;
  }
}
