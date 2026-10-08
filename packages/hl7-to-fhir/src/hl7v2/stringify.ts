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
 * MSH-1 and MSH-2 are written as they stand in the first two fields of the MSH segment, never escaped. The HL7 null
 * is always written as two quote characters, so a tree with nulls needs a message whose delimiters do not include
 * the quote; `parse` never returns such a tree.
 *
 * @param message - The message to write, usually from `parse`.
 * @returns The message text, or an empty string for a message without segments.
 *
 * @example
 * ```ts
 * import { parse, stringify } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\nPID|1||12345||Everyman^Adam\n");
 * if (result.ok) {
 *   stringify(result.value.message);
 *   // "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam\r"
 * }
 * ```
 */
export function stringify(message: Hl7Message): string {
  const { delimiters } = message;
  return message.segments
    .map((segment) => `${stringifySegment(segment, delimiters)}\r`)
    .join("");
}

function stringifySegment(segment: Segment, delimiters: Delimiters): string {
  const { field } = delimiters;
  if (segment.id !== "MSH") {
    return [
      segment.id,
      ...segment.fields.map((node) => stringifyField(node, delimiters)),
    ].join(field);
  }
  // MSH-1 and MSH-2 are the delimiters themselves, so they are neither separated nor escaped. The fallbacks only
  // matter for trees built by hand.
  const [separator, encoding, ...rest] = segment.fields;
  const header =
    segment.id +
    (verbatim(separator) || field) +
    (verbatim(encoding) || encodingCharacters(delimiters));
  return (
    header +
    rest.map((node) => field + stringifyField(node, delimiters)).join("")
  );
}

function encodingCharacters(delimiters: Delimiters): string {
  const {
    component,
    repetition,
    escape,
    subcomponent,
    truncation = "",
  } = delimiters;
  return component + repetition + escape + subcomponent + truncation;
}

/** The text of a field that parse keeps as a single value (MSH-1, MSH-2), or an empty string. */
function verbatim(field: Field | undefined): string {
  const value = field?.repetitions[0]?.components[0]?.subcomponents[0];
  return value?.kind === "value" ? value.value : "";
}

function stringifyField(field: Field, delimiters: Delimiters): string {
  return field.repetitions
    .map((repetition) => stringifyRepetition(repetition, delimiters))
    .join(delimiters.repetition);
}

function stringifyRepetition(
  repetition: Repetition,
  delimiters: Delimiters,
): string {
  return repetition.components
    .map((component) => stringifyComponent(component, delimiters))
    .join(delimiters.component);
}

function stringifyComponent(
  component: Component,
  delimiters: Delimiters,
): string {
  return component.subcomponents
    .map((subcomponent) => stringifySubcomponent(subcomponent, delimiters))
    .join(delimiters.subcomponent);
}

function stringifySubcomponent(
  subcomponent: Subcomponent,
  delimiters: Delimiters,
): string {
  switch (subcomponent.kind) {
    case "value":
      return encodeText(subcomponent.value, delimiters);
    case "null":
      return '""';
    case "empty":
      return "";
  }
}
