import type { Hl7Message, Repetition, Segment, Subcomponent } from "./model";
import { parsePath, type ParsedPath } from "./path";

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
export function get(message: Hl7Message, path: string): string | undefined {
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
export function getAll(message: Hl7Message, path: string): readonly string[] {
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
 * means "not sent". The path is read like {@link get} reads it. The result is `true` only for the explicit null; it is
 * `false` for a value, an empty position, a missing position and a path that does not parse.
 *
 * @param message - The message to read.
 * @param path - The path, such as `PID.8`.
 * @returns Whether the position holds the explicit null.
 *
 * @example
 * ```ts
 * import { isNull, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse('MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||||||""|');
 * if (result.ok) {
 *   isNull(result.value.message, "PID.7"); // true
 *   isNull(result.value.message, "PID.8"); // false: empty, not null
 * }
 * ```
 */
export function isNull(message: Hl7Message, path: string): boolean {
  const parsed = parsePath(path);
  return parsed.ok && subcomponentAt(message, parsed.value)?.kind === "null";
}

/** The subcomponent `get` reads: in the first selected segment, the first or indexed repetition. */
function subcomponentAt(
  message: Hl7Message,
  target: ParsedPath,
): Subcomponent | undefined {
  const [segment] = selectSegments(message, target);
  const repetitions = segment?.fields[target.field - 1]?.repetitions ?? [];
  const [repetition] = selectRepetitions(repetitions, target);
  return repetition === undefined ? undefined : leafOf(repetition, target);
}

/** The segments a path selects: the indexed one, or every segment with the identifier. */
function selectSegments(
  message: Hl7Message,
  target: ParsedPath,
): readonly Segment[] {
  const matching = message.segments.filter(({ id }) => id === target.segment);
  if (target.segmentIndex === undefined) return matching;
  const indexed = matching[target.segmentIndex - 1];
  return indexed === undefined ? [] : [indexed];
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
