import { type Issue, type Location, type Span } from "../shared/issue";
import { report } from "../shared/collect";
import { type DecodeContext, decodeText } from "./escape";
import {
  encodingCharactersSpan,
  firstFieldNumber,
  firstSplitHeaderField,
  headerSegmentId,
  segmentIdLength,
} from "./header";
import { indexOfOrEnd } from "./input";
import type {
  Component,
  Field,
  Repetition,
  Segment,
  Subcomponent,
} from "./model";

/**
 * Parses one segment (without its terminator) in a single pass over its characters.
 *
 * MSH-1 and MSH-2 hold the delimiters themselves, so in an MSH segment they become single values that are neither
 * split nor unescaped; every other field is split into repetitions, components and subcomponents.
 *
 * @param input - The whole input.
 * @param span - The segment text, without its terminator.
 * @param segmentIndex - The position of the segment in the message, for issue locations.
 * @param context - The delimiters and the character set of the message.
 * @param issues - Receives the issues about the segment identifier and the escape sequences in its values.
 * @param encoding - The span of MSH-2 when the caller has it already; looked up when absent. Only used for MSH.
 */
export function parseSegment(
  input: string,
  span: Span,
  segmentIndex: number,
  context: DecodeContext,
  issues: Issue[],
  encoding?: Span,
): Segment {
  const idEnd = indexOfOrEnd(
    input,
    context.delimiters.field,
    span.start,
    span.end,
  );
  const id = input.slice(span.start, idEnd);
  const validId = isValidSegmentId(id);
  if (!validId) {
    const location = { span: { start: span.start, end: idEnd }, segmentIndex };
    report(issues, "INVALID_SEGMENT_ID", location, id);
  }
  if (idEnd === span.end) return { id, fields: [], span };

  const location = validId ? { segmentIndex, segmentId: id } : { segmentIndex };
  const parser = { input, context, location, issues };
  const fields =
    id === headerSegmentId
      ? parseHeaderFields(
          parser,
          span,
          encoding ??
            encodingCharactersSpan(input, span, context.delimiters.field),
        )
      : parseFields(parser, idEnd + 1, span.end, firstFieldNumber);
  return { id, fields, span };
}

/**
 * Whether `id` is a valid segment identifier: an upper-case letter followed by two upper-case letters or digits.
 * Z segments (`ZPI`) and identifiers this library does not know are valid.
 */
export function isValidSegmentId(id: string): boolean {
  return (
    id.length === segmentIdLength &&
    isUpperCase(id.charCodeAt(0)) &&
    isUpperCaseOrDigit(id.charCodeAt(1)) &&
    isUpperCaseOrDigit(id.charCodeAt(2))
  );
}

function isUpperCase(code: number): boolean {
  return code >= 0x41 && code <= 0x5a;
}

function isUpperCaseOrDigit(code: number): boolean {
  return isUpperCase(code) || (code >= 0x30 && code <= 0x39);
}

/** What the field parser needs besides the range it parses. */
interface FieldParser {
  readonly input: string;
  readonly context: DecodeContext;
  /** The segment part of every issue location. */
  readonly location: Pick<Location, "segmentIndex" | "segmentId">;
  /** Receives the issues found in values. */
  readonly issues: Issue[];
}

/**
 * Parses the fields of an MSH segment, starting at MSH-1, the field separator.
 *
 * @param encoding - The span of MSH-2.
 */
function parseHeaderFields(
  parser: FieldParser,
  segment: Span,
  encoding: Span,
): Field[] {
  const separator = { start: encoding.start - 1, end: encoding.start };
  return [
    verbatimField(parser.input, separator),
    verbatimField(parser.input, encoding),
  ].concat(
    parseFields(parser, encoding.end + 1, segment.end, firstSplitHeaderField),
  );
}

/** A field holding its raw text as a single value, for MSH-1 and MSH-2. */
function verbatimField(input: string, span: Span): Field {
  if (span.start === span.end) return { repetitions: [], span };
  const value: Subcomponent = {
    kind: "value",
    value: input.slice(span.start, span.end),
    span,
  };
  return {
    repetitions: [{ components: [{ subcomponents: [value], span }], span }],
    span,
  };
}

/** The delimiter levels, from the lowest to the highest. A delimiter closes the open node of its level and below. */
type Level = "subcomponent" | "component" | "repetition" | "field";

/** The nodes that are open while fields are parsed: the children collected so far and where each node started. */
interface OpenNodes {
  readonly fields: Field[];
  repetitions: Repetition[];
  components: Component[];
  subcomponents: Subcomponent[];
  fieldStart: number;
  repetitionStart: number;
  componentStart: number;
  subcomponentStart: number;
  /** Whether the open subcomponent contains an escape or truncation character, so that it needs decoding. */
  special: boolean;
}

/**
 * Parses the fields between `from` and `end` in one pass. Each delimiter closes the open node of its level and of
 * every level below it; the end of the range closes everything, like a field separator. Trailing empty children are
 * dropped when their parent closes.
 *
 * @param firstFieldNumber - The HL7 field number of the field starting at `from`, for issue locations.
 */
function parseFields(
  parser: FieldParser,
  from: number,
  end: number,
  firstFieldNumber: number,
): Field[] {
  const { input } = parser;
  const levelOf = createLevelLookup(parser.context);
  // Omitted delimiters (MSH-2 may omit them) match no character.
  const { escape, truncation } = parser.context.delimiters;
  const escapeCode = escape?.charCodeAt(0);
  const truncationCode = truncation?.charCodeAt(0);
  const open: OpenNodes = {
    fields: [],
    repetitions: [],
    components: [],
    subcomponents: [],
    fieldStart: from,
    repetitionStart: from,
    componentStart: from,
    subcomponentStart: from,
    special: false,
  };
  for (let index = from; index < end; index++) {
    const code = input.charCodeAt(index);
    if (code === escapeCode || code === truncationCode) {
      open.special = true;
      continue;
    }
    const level = levelOf(code);
    if (level !== undefined)
      close(parser, open, level, index, firstFieldNumber);
  }
  if (from <= end) close(parser, open, "field", end, firstFieldNumber);
  return withoutTrailing(open.fields, (node) => node.repetitions.length === 0);
}

/** Closes the open nodes up to `level` at the delimiter at `index`. */
function close(
  parser: FieldParser,
  open: OpenNodes,
  level: Level,
  index: number,
  firstFieldNumber: number,
): void {
  const span = { start: open.subcomponentStart, end: index };
  open.subcomponents.push(
    open.special
      ? decodedValue(parser, span, {
          field: firstFieldNumber + open.fields.length,
          repetition: open.repetitions.length + 1,
          component: open.components.length + 1,
          subcomponent: open.subcomponents.length + 1,
        })
      : plainSubcomponent(parser.input, span),
  );
  open.subcomponentStart = index + 1;
  open.special = false;
  if (level === "subcomponent") return;

  open.components.push({
    subcomponents: withoutTrailing(
      open.subcomponents,
      (node) => node.kind === "empty",
    ),
    span: { start: open.componentStart, end: index },
  });
  open.subcomponents = [];
  open.componentStart = index + 1;
  if (level === "component") return;

  open.repetitions.push({
    components: withoutTrailing(
      open.components,
      (node) => node.subcomponents.length === 0,
    ),
    span: { start: open.repetitionStart, end: index },
  });
  open.components = [];
  open.repetitionStart = index + 1;
  if (level === "repetition") return;

  open.fields.push({
    repetitions: withoutTrailing(
      open.repetitions,
      (node) => node.components.length === 0,
    ),
    span: { start: open.fieldStart, end: index },
  });
  open.repetitions = [];
  open.fieldStart = index + 1;
}

function createLevelLookup(
  context: DecodeContext,
): (code: number) => Level | undefined {
  const { field, repetition, component, subcomponent } = context.delimiters;
  const fieldCode = field.charCodeAt(0);
  const repetitionCode = repetition.charCodeAt(0);
  const componentCode = component.charCodeAt(0);
  const subcomponentCode = subcomponent?.charCodeAt(0);
  return (code) => {
    switch (code) {
      case fieldCode:
        return "field";
      case repetitionCode:
        return "repetition";
      case componentCode:
        return "component";
      case subcomponentCode:
        return "subcomponent";
      default:
        return undefined;
    }
  };
}

/** Removes trailing elements that are empty; the array is owned by the caller, so it is changed in place. */
function withoutTrailing<T>(nodes: T[], isEmpty: (node: T) => boolean): T[] {
  for (
    let last = nodes.at(-1);
    last !== undefined && isEmpty(last);
    last = nodes.at(-1)
  ) {
    nodes.pop();
  }
  return nodes;
}

/** The position of a subcomponent within its segment, as 1-based HL7 numbers. */
type SubcomponentPosition = Required<
  Pick<Location, "field" | "repetition" | "component" | "subcomponent">
>;

/** A subcomponent without escape and truncation characters: empty, the HL7 null `""`, or a value as written. */
function plainSubcomponent(input: string, span: Span): Subcomponent {
  if (span.start === span.end) return { kind: "empty", span };
  if (span.end - span.start === 2 && input.startsWith('""', span.start)) {
    return { kind: "null", span };
  }
  return { kind: "value", value: input.slice(span.start, span.end), span };
}

/** A subcomponent with escape or truncation characters, decoded; issues are reported where they were found. */
function decodedValue(
  parser: FieldParser,
  span: Span,
  position: SubcomponentPosition,
): Subcomponent {
  const { input } = parser;
  const { value, truncated } = decodeText(
    input,
    span,
    parser.context,
    (code, at) => {
      const location = { span: at, ...parser.location, ...position };
      report(parser.issues, code, location, input.slice(at.start, at.end));
    },
  );
  return truncated
    ? { kind: "value", value, truncated, span }
    : { kind: "value", value, span };
}
