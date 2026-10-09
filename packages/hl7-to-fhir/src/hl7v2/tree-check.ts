// Plain JavaScript callers and hand-built trees can hand `stringify`, `validate` and `group` anything. This module
// checks that a tree has the shape of `Hl7Message` before anything reads it, so that writing and validating never meet
// a missing node and never throw.
import type { Issue, Location, Span } from "../shared/issue";
import { issue } from "../shared/issue-table";
import { emptySpanAt } from "../shared/span";
import { isDelimiterCharacter } from "./header";
import { isValidSegmentId } from "./segment";
import { type StringifyFailure, stringifyFailure } from "./stringify-failure";

/** An object whose properties are still unchecked. */
type Unchecked = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Unchecked {
  return typeof value === "object" && value !== null;
}

const noSpan = emptySpanAt(0);

/**
 * The span a node gives itself, or `fallback` when it has none that could locate it: the span is not part of what
 * `stringify` writes, so a tree without spans is still written, and a failure in it is located by its numbers.
 */
export function spanOf(node: unknown, fallback: Span = noSpan): Span {
  return (isObject(node) ? ownSpan(node) : undefined) ?? fallback;
}

/** The span of a node: whole, non-negative offsets in order, or `undefined` when it has no such span. */
function ownSpan(node: Unchecked): Span | undefined {
  const { span } = node;
  if (!isObject(span)) return undefined;
  const { start, end } = span;
  return typeof start === "number" &&
    typeof end === "number" &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end
    ? { start, end }
    : undefined;
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
  const { delimiters } = message;
  if (!isDeclarable(delimiters)) {
    return stringifyFailure("INVALID_DELIMITERS", { span: noSpan });
  }
  return checkShape(message, {
    spanOf: (node, parent) => ownSpan(node) ?? parent,
    checkId: (id, location) =>
      // `parse` cuts the identifier at the first field separator and every segment at a carriage return; any other
      // identifier, valid or not, reads back as written.
      id.includes(delimiters.field) || id.includes("\r")
        ? stringifyFailure("INVALID_SEGMENT_ID", location)
        : undefined,
  });
}

/**
 * Checks that a tree has the shape of `Hl7Message` for the functions that read a tree without writing it, `validate`
 * and `group`: every node has a valid span, which their issues point to, while delimiters and segment identifiers only
 * matter to writing and are not checked.
 *
 * @returns One `INVALID_TREE` issue at the first node that is missing, of the wrong type or without a valid span, or
 *   `undefined` when the tree has the shape of a message.
 */
export function shapeIssue(message: unknown): Issue | undefined {
  const failure = isObject(message)
    ? checkShape(message, { spanOf: ownSpan, checkId: () => undefined })
    : stringifyFailure("INVALID_TREE", { span: noSpan });
  return failure && issue("INVALID_TREE", failure.location);
}

/** What writing and reading a tree need differently from the walk over its shape. */
interface ShapeRules {
  /** The span of a node, given the span of its parent; `undefined` when the node has none it can be used with. */
  readonly spanOf: (node: Unchecked, parent: Span) => Span | undefined;
  /** A problem with a segment identifier beyond its type, found before the fields of the segment are checked. */
  readonly checkId: (
    id: string,
    location: Location,
  ) => StringifyFailure | undefined;
}

/** Walks the segments and everything below them, in order, and returns the first node that does not fit. */
function checkShape(
  message: Unchecked,
  rules: ShapeRules,
): StringifyFailure | undefined {
  const { segments, version } = message;
  if (!Array.isArray(segments) || !isOptionalString(version)) {
    return stringifyFailure("INVALID_TREE", { span: noSpan });
  }
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const failure = checkSegment(segments[segmentIndex], segmentIndex, rules);
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

/** Checks a segment and everything below it. */
function checkSegment(
  segment: unknown,
  segmentIndex: number,
  rules: ShapeRules,
): StringifyFailure | undefined {
  const at = { segmentIndex };
  const node = isObject(segment) ? segment : undefined;
  const span = node && rules.spanOf(node, noSpan);
  const { id, fields } = node ?? {};
  if (span === undefined || typeof id !== "string" || !Array.isArray(fields)) {
    return stringifyFailure("INVALID_TREE", { span: span ?? noSpan, ...at });
  }
  const failure = rules.checkId(id, { span, ...at });
  if (failure !== undefined) return failure;
  const location = isValidSegmentId(id) ? { ...at, segmentId: id } : at;
  return checkChildren(fields, 0, span, location, rules);
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
  rules: ShapeRules,
): StringifyFailure | undefined {
  if (!Array.isArray(list)) {
    return stringifyFailure("INVALID_TREE", { span: parent, ...location });
  }
  // A plain loop visits holes, which `every` and `forEach` would skip.
  for (let index = 0; index < list.length; index++) {
    const node: unknown = list[index];
    const at = { ...location, [numbers[depth]]: index + 1 };
    const span = isObject(node) ? rules.spanOf(node, parent) : undefined;
    if (!isObject(node) || span === undefined) {
      return stringifyFailure("INVALID_TREE", { span: parent, ...at });
    }
    const failure =
      depth === 3
        ? checkSubcomponent(node, { span, ...at })
        : checkChildren(
            node[childLists[depth]],
            nextDepth[depth],
            span,
            at,
            rules,
          );
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
