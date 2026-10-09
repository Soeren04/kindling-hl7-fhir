// Plain JavaScript callers and hand-built trees can hand `stringify` anything. This module checks that a tree has
// the shape of `Hl7Message` before anything is written, so that writing never meets a missing node and never throws.
import type { Location, Span } from "../shared/issue";
import { isDelimiterCharacter } from "./delimiters";
import { isValidSegmentId } from "./segment";
import { type StringifyFailure, stringifyFailure } from "./stringify-failure";

/** An object whose properties are still unchecked. */
type Unchecked = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Unchecked {
  return typeof value === "object" && value !== null;
}

const noSpan: Span = { start: 0, end: 0 };

/**
 * The span a node gives itself, or `fallback` when it has none that could locate it: the span is not part of what
 * `stringify` writes, so a tree without spans is still written, and a failure in it is located by its numbers.
 */
export function spanOf(node: unknown, fallback: Span = noSpan): Span {
  if (!isObject(node)) return fallback;
  const { span } = node;
  if (!isObject(span)) return fallback;
  const { start, end } = span;
  return typeof start === "number" &&
    typeof end === "number" &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end
    ? { start, end }
    : fallback;
}

/**
 * Finds the first reason the tree cannot be written as it stands: a shape other than `Hl7Message` (`INVALID_TREE`),
 * unusable delimiters (`INVALID_DELIMITERS`), or a segment identifier that would not read back
 * (`INVALID_SEGMENT_ID`). Whether the first segment is MSH is left to the caller, which needs that segment anyway.
 *
 * @returns The failure, or `undefined` when the tree has the shape of a message.
 */
export function checkTree(message: unknown): StringifyFailure | undefined {
  if (!isObject(message)) {
    return stringifyFailure("INVALID_TREE", { span: noSpan });
  }
  const { delimiters, segments, version } = message;
  if (!isDeclarable(delimiters)) {
    return stringifyFailure("INVALID_DELIMITERS", { span: noSpan });
  }
  if (!Array.isArray(segments) || !isOptionalString(version)) {
    return stringifyFailure("INVALID_TREE", { span: noSpan });
  }
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const failure = checkSegment(
      segments[segmentIndex],
      segmentIndex,
      delimiters.field,
    );
    if (failure !== undefined) return failure;
  }
  return undefined;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

/** MSH-1 and the first two characters of MSH-2 (field, component and repetition separators) are required. */
const requiredDelimiters = 3;

/** The delimiters as `Delimiters` declares them, once they are known to be declarable. */
interface DeclarableDelimiters {
  readonly field: string;
}

/**
 * Whether the delimiters can be written into MSH-1 and MSH-2 and read back: each a delimiter character, all distinct,
 * and none declared after one that is omitted, because MSH-2 assigns them by position.
 */
function isDeclarable(delimiters: unknown): delimiters is DeclarableDelimiters {
  if (!isObject(delimiters)) return false;
  const { field, component, repetition, escape, subcomponent, truncation } =
    delimiters;
  const ordered = [
    field,
    component,
    repetition,
    escape,
    subcomponent,
    truncation,
  ];
  // MSH-2 assigns the delimiters by position, so one can only be declared after every one before it.
  const firstOmitted = ordered.indexOf(undefined);
  const length = firstOmitted === -1 ? ordered.length : firstOmitted;
  const declared = ordered.slice(0, length);
  return (
    length >= requiredDelimiters &&
    ordered.slice(length).every((character) => character === undefined) &&
    declared.every(
      (character) =>
        typeof character === "string" && isDelimiterCharacter(character),
    ) &&
    new Set(declared).size === declared.length
  );
}

function checkSegment(
  segment: unknown,
  segmentIndex: number,
  fieldSeparator: string,
): StringifyFailure | undefined {
  const at = { segmentIndex };
  const span = spanOf(segment);
  const { id, fields } = isObject(segment) ? segment : {};
  if (typeof id !== "string" || !Array.isArray(fields)) {
    return stringifyFailure("INVALID_TREE", { span, ...at });
  }
  // `parse` cuts the identifier at the first field separator and every segment at a carriage return; any other
  // identifier, valid or not, reads back as written.
  if (id.includes(fieldSeparator) || id.includes("\r")) {
    return stringifyFailure("INVALID_SEGMENT_ID", { span, ...at });
  }
  const location = isValidSegmentId(id) ? { ...at, segmentId: id } : at;
  return checkChildren(fields, 0, span, location);
}

// The levels below a segment: the property that holds the children of a node at each depth, and the location
// property that numbers the node.
const childLists = ["repetitions", "components", "subcomponents"] as const;
const numbers = ["field", "repetition", "component", "subcomponent"] as const;

/** The depth of a list below its segment: 0 for fields, 3 for subcomponents. */
type Depth = 0 | 1 | 2 | 3;

const nextDepth = { 0: 1, 1: 2, 2: 3 } as const;

/** Checks a list of nodes at `depth` and everything below it; `parent` locates a node that is missing. */
function checkChildren(
  list: unknown,
  depth: Depth,
  parent: Span,
  location: Omit<Location, "span">,
): StringifyFailure | undefined {
  if (!Array.isArray(list)) {
    return stringifyFailure("INVALID_TREE", { span: parent, ...location });
  }
  // A plain loop visits holes, which `every` and `forEach` would skip.
  for (let index = 0; index < list.length; index++) {
    const node: unknown = list[index];
    const at = { ...location, [numbers[depth]]: index + 1 };
    const span = spanOf(node, parent);
    if (!isObject(node)) {
      return stringifyFailure("INVALID_TREE", { span, ...at });
    }
    const failure =
      depth === 3
        ? checkSubcomponent(node, { span, ...at })
        : checkChildren(node[childLists[depth]], nextDepth[depth], span, at);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

function checkSubcomponent(
  node: Unchecked,
  location: Location,
): StringifyFailure | undefined {
  const { kind, value, truncated } = node;
  const valid =
    kind === "empty" ||
    kind === "null" ||
    (kind === "value" &&
      typeof value === "string" &&
      (truncated === undefined || truncated === true));
  return valid ? undefined : stringifyFailure("INVALID_TREE", location);
}
