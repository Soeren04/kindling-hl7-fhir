import type { Hl7Message, Repetition, Segment, Subcomponent } from "./model";
import { parsePath, type ParsedPath } from "./path";
import type { Hl7Path } from "./path-type";

/**
 * Reads the text at a path, or `undefined` when there is none.
 *
 * Paths use HL7 notation, so `PID.5.1` is component 1 of field 5 of the `PID` segment, the same position as
 * `segment.fields[5 - 1]` (ADR 0008). `MSH.1` is the field separator and `MSH.2` the encoding characters. The rules:
 *
 * - A segment without an index (`PID.5`) is the first segment with that identifier; `OBX[3]` is the third `OBX`
 *   counted over the whole message, not within a group.
 * - A field without an index (`PID.3`) is its first repetition; `PID.3[2]` is the second.
 * - A path that stops at a field or a component continues with the first component and the first subcomponent:
 *   `PID.5` is `PID.5.1.1`, and `PID.5.1` is `PID.5.1.1` even when the component has more subcomponents.
 * - The result is the decoded text of a value. It is `undefined` for an empty or missing position and for the
 *   explicit null `""`; use {@link isNull} to tell the null from the absence.
 * - A path that does not parse (see `parsePath`) matches nothing, so the result is `undefined`.
 *
 * Each call scans the segments from the start of the message up to the one it reads and stops there, so reading
 * `OBX[n]` for every `n` scans the message once per segment; {@link getAll} reads every repetition or segment in
 * one pass.
 *
 * @typeParam P - The type of the path, which {@link Hl7Path} checks when it is a string literal.
 * @param message - The message to read.
 * @param path - The path, such as `PID.5.1`.
 * @returns The text, or `undefined`.
 *
 * @example
 * ```ts
 * import { get, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||12345^^^HOSP^MR||Everyman^Adam");
 * if (result.ok) {
 *   get(result.value.message, "PID.5.1"); // "Everyman"
 *   get(result.value.message, "MSH.9.2"); // "A01"
 * }
 * ```
 */
export function get<P extends string>(
  message: Hl7Message,
  path: Hl7Path<P>,
): string | undefined {
  const parsed = parsePath(path);
  if (!parsed.ok) return undefined;
  const subcomponent = subcomponentAt(message, parsed.value);
  return subcomponent?.kind === "value" ? subcomponent.value : undefined;
}

/**
 * Reads the text at every position a path selects.
 *
 * Without indexes a path selects everything it can: `OBX.5` is field 5 of every `OBX` segment, and `PID.3.1` is
 * component 1 of every repetition of field 3. An index narrows the selection to one segment (`OBX[3].5`) or one
 * repetition (`PID.3[2].1`). The values come in message order. Each selected repetition contributes the text
 * {@link get} would return for it; empty positions and the explicit null `""` contribute nothing. A path that does not
 * parse selects nothing.
 *
 * It reads the message in one pass, so it is the way to go through every repetition or every segment of an
 * identifier; calling {@link get} with each index would scan the message again for each one.
 *
 * @typeParam P - The type of the path, which {@link Hl7Path} checks when it is a string literal.
 * @param message - The message to read.
 * @param path - The path, such as `PID.3.1`.
 * @returns The texts in message order; empty when the path selects nothing.
 *
 * @example
 * ```ts
 * import { getAll, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||111^^^HOSP^MR~222^^^HOSP^PI");
 * if (result.ok) {
 *   getAll(result.value.message, "PID.3.1"); // ["111", "222"]
 * }
 * ```
 */
export function getAll<P extends string>(
  message: Hl7Message,
  path: Hl7Path<P>,
): readonly string[] {
  const parsed = parsePath(path);
  if (!parsed.ok) return [];
  const { value: target } = parsed;
  const texts: string[] = [];
  for (const segment of selectSegments(message, target)) {
    const repetitions = segment.fields[target.field - 1]?.repetitions ?? [];
    for (const repetition of selectRepetitions(repetitions, target)) {
      const subcomponent = leafOf(repetition, target);
      if (subcomponent?.kind === "value") texts.push(subcomponent.value);
    }
  }
  return texts;
}

/**
 * Whether the sender stated that the value at a path is null.
 *
 * HL7 distinguishes the explicit null `""`, which asks the receiver to delete the value, from an empty field, which
 * means "not sent" (HL7 v2.5.1 section 2.5.3). A position is null only when all of it is the null, so the answer
 * depends on how far the path reaches:
 *
 * - A path to a field or repetition (`PID.8`, `PID.3[2]`) is null when the repetition is exactly `""`: one component
 *   holding one null subcomponent. `""^Adam` is not null; its first component is.
 * - A path to a component (`PID.5.1`) is null when the component is exactly one null subcomponent.
 * - A path to a subcomponent (`PID.5.1.2`) is null when that subcomponent is the null.
 *
 * Segments and repetitions are selected like {@link get} selects them. The result is `false` for a value, an empty
 * position, a missing position and a path that does not parse.
 *
 * @typeParam P - The type of the path, which {@link Hl7Path} checks when it is a string literal.
 * @param message - The message to read.
 * @param path - The path, such as `PID.8`.
 * @returns Whether the position holds the explicit null and nothing else.
 *
 * @example
 * ```ts
 * import { isNull, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse('MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||||""^Adam||""|');
 * if (result.ok) {
 *   isNull(result.value.message, "PID.7"); // true
 *   isNull(result.value.message, "PID.8"); // false: empty, not null
 *   isNull(result.value.message, "PID.5"); // false: only the first component is null
 *   isNull(result.value.message, "PID.5.1"); // true
 * }
 * ```
 */
export function isNull<P extends string>(
  message: Hl7Message,
  path: Hl7Path<P>,
): boolean {
  const parsed = parsePath(path);
  if (!parsed.ok) return false;
  const target = parsed.value;
  const repetition = repetitionAt(message, target);
  if (target.component === undefined) {
    const component = onlyChild(repetition?.components);
    return onlyChild(component?.subcomponents)?.kind === "null";
  }
  const component = repetition?.components[target.component - 1];
  if (target.subcomponent === undefined) {
    return onlyChild(component?.subcomponents)?.kind === "null";
  }
  return component?.subcomponents[target.subcomponent - 1]?.kind === "null";
}

/** The single element of a list, or `undefined` when it has none or several. */
function onlyChild<T>(list: readonly T[] | undefined): T | undefined {
  return list?.length === 1 ? list[0] : undefined;
}

/** The subcomponent `get` reads: in the first or indexed segment, the first or indexed repetition. */
function subcomponentAt(
  message: Hl7Message,
  target: ParsedPath,
): Subcomponent | undefined {
  const repetition = repetitionAt(message, target);
  return repetition === undefined ? undefined : leafOf(repetition, target);
}

/** The repetition a path names in the segment {@link segmentAt} finds: the indexed one, or the first. */
function repetitionAt(
  message: Hl7Message,
  target: ParsedPath,
): Repetition | undefined {
  const field = segmentAt(message, target)?.fields[target.field - 1];
  return field?.repetitions[(target.fieldIndex ?? 1) - 1];
}

/**
 * The segment a path names: the indexed occurrence of its identifier, or the first. The scan stops there, so its cost
 * grows with the position of the segment, not with the size of the message.
 */
function segmentAt(
  message: Hl7Message,
  target: ParsedPath,
): Segment | undefined {
  const occurrence = target.segmentIndex ?? 1;
  let seen = 0;
  for (const segment of message.segments) {
    if (segment.id === target.segment) {
      seen++;
      if (seen === occurrence) return segment;
    }
  }
  return undefined;
}

/** The segments a path selects: the indexed one, or every segment with the identifier. */
function selectSegments(
  message: Hl7Message,
  target: ParsedPath,
): readonly Segment[] {
  if (target.segmentIndex !== undefined) {
    const indexed = segmentAt(message, target);
    return indexed === undefined ? [] : [indexed];
  }
  return message.segments.filter(({ id }) => id === target.segment);
}
/** The repetitions a path selects: the indexed one, or all of them. */
function selectRepetitions(
  repetitions: readonly Repetition[],
  target: ParsedPath,
): readonly Repetition[] {
  if (target.fieldIndex === undefined) return repetitions;
  const indexed = repetitions[target.fieldIndex - 1];
  return indexed === undefined ? [] : [indexed];
}

/** The subcomponent named by the path, with the first component and subcomponent as defaults. */
function leafOf(
  repetition: Repetition,
  target: ParsedPath,
): Subcomponent | undefined {
  const component = repetition.components[(target.component ?? 1) - 1];
  return component?.subcomponents[(target.subcomponent ?? 1) - 1];
}
