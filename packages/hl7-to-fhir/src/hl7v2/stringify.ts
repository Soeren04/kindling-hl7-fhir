import type { Location } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";
import { encodeText } from "./escape";
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

/**
 * Why a tree cannot be written with the delimiters of its message.
 *
 * The codes are separate from the issue codes of `parse`, because a failure of `stringify` is about a tree, not about
 * input text.
 *
 * - `ESCAPE_CHARACTER_REQUIRED`: a value contains a delimiter or a carriage return or is the text `""`, which need an
 *   escape sequence, but MSH-2 declares no escape character. Line feeds are written as they are, except in MSH,
 *   where a line feed would end the segment.
 * - `SUBCOMPONENT_SEPARATOR_REQUIRED`: a component has more than one subcomponent, but MSH-2 declares no subcomponent
 *   separator.
 * - `NULL_NOT_REPRESENTABLE`: a subcomponent is the HL7 null, but the quote character is one of the delimiters, so
 *   `""` would not read back as the null.
 * - `TRUNCATION_CHARACTER_REQUIRED`: a value is marked as truncated, but MSH-2 declares no truncation character.
 */
export type StringifyFailureCode =
  | "ESCAPE_CHARACTER_REQUIRED"
  | "SUBCOMPONENT_SEPARATOR_REQUIRED"
  | "NULL_NOT_REPRESENTABLE"
  | "TRUNCATION_CHARACTER_REQUIRED";

// One message per code, like the issue messages; a message never contains message content.
const failureMessages: Readonly<Record<StringifyFailureCode, string>> = {
  ESCAPE_CHARACTER_REQUIRED:
    'A value contains a delimiter or a line break that cannot be written as it is, or is the text "", which need an escape sequence, but MSH-2 declares no escape character.',
  SUBCOMPONENT_SEPARATOR_REQUIRED:
    "A component has several subcomponents, but MSH-2 declares no subcomponent separator.",
  NULL_NOT_REPRESENTABLE:
    'A subcomponent is the HL7 null, but the quote is one of the delimiters, so "" would not read back as the null.',
  TRUNCATION_CHARACTER_REQUIRED:
    "A value is marked as truncated, but MSH-2 declares no truncation character.",
};

/**
 * The reason {@link stringify} could not write a message: the first node, in message order, that the delimiters of
 * the message cannot express. Trees returned by `parse` never fail; only trees built or changed by hand can.
 *
 * @example
 * ```ts
 * import { stringify, type Hl7Message } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 *
 * const result = stringify(message);
 * if (!result.ok) console.error(result.error.code, result.error.location.field); // "ESCAPE_CHARACTER_REQUIRED", 5
 * ```
 */
export interface StringifyFailure {
  /** Discriminant: why the node cannot be written. */
  readonly code: StringifyFailureCode;
  /** A description without message content. */
  readonly message: string;
  /** The node: its position in HL7 numbers (`segmentIndex`, `field`, ...) and the span the tree gives it. */
  readonly location: Location;
}

/**
 * Writes a message as HL7 v2 text: the inverse of `parse`.
 *
 * The output is canonical. Every segment, the last one included, ends with a carriage return. Values are escaped with
 * the message delimiters, so `parse(stringify(message))` yields the same tree except for its spans, which describe
 * the new text. Nodes are written as the tree holds them: parsed trees never end in empty nodes, so the output has no
 * trailing delimiters, but a tree built by hand with trailing empty nodes keeps them.
 *
 * Three things do not survive a round trip, because the tree no longer holds them: formatting commands that `parse`
 * removed from a value, the original spelling of escape sequences (`\X41\` is written as `A`), and the terminators
 * and framing of the input. A value that is empty because it consisted only of removed formatting commands is
 * written as an empty subcomponent.
 *
 * MSH-1 and MSH-2 are written as they stand in the first two fields of the MSH segment, never escaped; a tree without
 * them gets the delimiters of the message. Segment identifiers are written as they are.
 *
 * Writing fails, instead of producing text that reads back differently, when the tree holds something the delimiters
 * cannot express (see {@link StringifyFailureCode}). That happens only for trees built or changed by hand, for
 * example a value with a `|` in a message whose MSH-2 omits the escape character.
 *
 * @param message - The message to write, usually from `parse`.
 * @returns The message text (empty for a message without segments), or the first node that cannot be written.
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
  const writer: Writer = { delimiters: message.delimiters, failure: undefined };
  let text = "";
  for (const [segmentIndex, segment] of message.segments.entries()) {
    text += `${writeSegment(writer, segment, segmentIndex)}\r`;
  }
  return writer.failure === undefined ? ok(text) : err(writer.failure);
}

/** The delimiters to write with and the first node that could not be written. */
interface Writer {
  readonly delimiters: Delimiters;
  failure: StringifyFailure | undefined;
}

/** Where a node is, for the failure location; numbers are 1-based. */
type Position = Omit<Location, "span">;

function fail(
  writer: Writer,
  code: StringifyFailureCode,
  location: Location,
): string {
  writer.failure ??= { code, message: failureMessages[code], location };
  return "";
}

function writeSegment(
  writer: Writer,
  segment: Segment,
  segmentIndex: number,
): string {
  const position: Position = isValidSegmentId(segment.id)
    ? { segmentIndex, segmentId: segment.id }
    : { segmentIndex };
  // In MSH, fields[0] and fields[1] are MSH-1 and MSH-2: the delimiters themselves, written verbatim with the id.
  const header = segment.id === "MSH";
  const first = header ? 2 : 0;
  let text = header ? mshHeader(segment, writer.delimiters) : segment.id;
  for (const [index, field] of segment.fields.slice(first).entries()) {
    const fieldNumber = first + index + 1;
    text += writer.delimiters.field;
    text += writeField(writer, field, { ...position, field: fieldNumber });
  }
  return text;
}

/** `MSH`, MSH-1 and MSH-2, taken from the first two fields, or from the delimiters when a hand-built tree lacks them. */
function mshHeader(segment: Segment, delimiters: Delimiters): string {
  const [separator, encoding] = segment.fields;
  return (
    segment.id +
    (verbatim(separator) || delimiters.field) +
    (verbatim(encoding) || encodingCharacters(delimiters))
  );
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

/** The text of a field that parse keeps as a single value (MSH-1, MSH-2), or an empty string. */
function verbatim(field: Field | undefined): string {
  const value = field?.repetitions[0]?.components[0]?.subcomponents[0];
  return value?.kind === "value" ? value.value : "";
}

function writeField(writer: Writer, field: Field, position: Position): string {
  return field.repetitions
    .map((repetition, index) =>
      writeRepetition(writer, repetition, {
        ...position,
        repetition: index + 1,
      }),
    )
    .join(writer.delimiters.repetition);
}

function writeRepetition(
  writer: Writer,
  repetition: Repetition,
  position: Position,
): string {
  return repetition.components
    .map((component, index) =>
      writeComponent(writer, component, { ...position, component: index + 1 }),
    )
    .join(writer.delimiters.component);
}

function writeComponent(
  writer: Writer,
  component: Component,
  position: Position,
): string {
  const { subcomponent: separator } = writer.delimiters;
  const { subcomponents } = component;
  // Without a separator, only a single subcomponent can be written; the join below then needs no separator.
  if (separator === undefined && subcomponents.length > 1) {
    return fail(writer, "SUBCOMPONENT_SEPARATOR_REQUIRED", {
      span: component.span,
      ...position,
    });
  }
  return subcomponents
    .map((subcomponent, index) =>
      writeSubcomponent(writer, subcomponent, {
        ...position,
        subcomponent: index + 1,
      }),
    )
    .join(separator ?? "");
}

function writeSubcomponent(
  writer: Writer,
  subcomponent: Subcomponent,
  position: Position,
): string {
  const location = { span: subcomponent.span, ...position };
  switch (subcomponent.kind) {
    case "value": {
      const { value } = subcomponent;
      // A raw line feed would end MSH, and the terminator of MSH decides how every segment ends.
      const lineFeedInHeader =
        position.segmentId === "MSH" &&
        writer.delimiters.escape === undefined &&
        value.includes("\n");
      const encoded = lineFeedInHeader
        ? undefined
        : encodeText(value, writer.delimiters);
      if (encoded === undefined) {
        return fail(writer, "ESCAPE_CHARACTER_REQUIRED", location);
      }
      if (subcomponent.truncated !== true) return encoded;
      // The marker goes after the escaped value, unescaped, where parse reads it as the truncation.
      const { truncation } = writer.delimiters;
      return truncation === undefined
        ? fail(writer, "TRUNCATION_CHARACTER_REQUIRED", location)
        : encoded + truncation;
    }
    case "null":
      return quoteIsDelimiter(writer.delimiters)
        ? fail(writer, "NULL_NOT_REPRESENTABLE", location)
        : '""';
    case "empty":
      return "";
  }
}

function quoteIsDelimiter(delimiters: Delimiters): boolean {
  return Object.values(delimiters).includes('"');
}
