import type { LocatedIssue, Location, Span } from "../shared/issue";
import { type DecodeContext, decodeText } from "./escape";
import { indexOfOrEnd } from "./header";
import type {
  Component,
  Field,
  Repetition,
  Segment,
  Subcomponent,
} from "./model";

/** A parsed segment and the remarks about it. */
export interface SegmentReading {
  /** The segment. */
  readonly segment: Segment;
  /** Remarks about the segment identifier and escape sequences in its values. */
  readonly issues: readonly LocatedIssue[];
}

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
 */
export function parseSegment(
  input: string,
  span: Span,
  segmentIndex: number,
  context: DecodeContext,
): SegmentReading {
  const { field } = context.delimiters;
  const idEnd = indexOfOrEnd(input, field, span.start, span.end);
  const id = input.slice(span.start, idEnd);
  const validId = isValidSegmentId(id);
  const issues: LocatedIssue[] = [];
  if (!validId) {
    issues.push({
      code: "INVALID_SEGMENT_ID",
      severity: "error",
      message:
        "A segment identifier must be three upper-case letters or digits, starting with a letter.",
      location: { span: { start: span.start, end: idEnd }, segmentIndex },
      value: id,
    });
  }
  const location = validId ? { segmentIndex, segmentId: id } : { segmentIndex };
  if (idEnd === span.end) {
    return { segment: { id, fields: [], span }, issues };
  }

  const parser = { input, context, location, issues };
  const fields =
    id === "MSH"
      ? parseHeaderFields(parser, idEnd, span.end)
      : parseFields(parser, idEnd + 1, span.end, 1);
  return { segment: { id, fields, span }, issues };
}

/**
 * Whether `id` is a valid segment identifier: an upper-case letter followed by two upper-case letters or digits.
 * Z segments (`ZPI`) and identifiers this library does not know are valid.
 */
export function isValidSegmentId(id: string): boolean {
  return (
    id.length === 3 &&
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
  readonly issues: LocatedIssue[];
}

/**
 * Parses the fields of an MSH segment, starting at MSH-1 (the field separator at `separator`).
 */
function parseHeaderFields(
  parser: FieldParser,
  separator: number,
  end: number,
): Field[] {
  const encodingEnd = indexOfOrEnd(
    parser.input,
    parser.context.delimiters.field,
    separator + 1,
    end,
  );
  const msh1 = verbatimField(parser.input, {
    start: separator,
    end: separator + 1,
  });
  const msh2 = verbatimField(parser.input, {
    start: separator + 1,
    end: encodingEnd,
  });
  const rest =
    encodingEnd < end ? parseFields(parser, encodingEnd + 1, end, 3) : [];
  return [msh1, msh2, ...rest];
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

/** Delimiter levels, ordered so that a delimiter also closes every lower level. */
const Level = {
  None: 0,
  Subcomponent: 1,
  Component: 2,
  Repetition: 3,
  Field: 4,
} as const;

type Level = (typeof Level)[keyof typeof Level];

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
  const escapeCode = parser.context.delimiters.escape.charCodeAt(0);

  const fields: Field[] = [];
  let repetitions: Repetition[] = [];
  let components: Component[] = [];
  let subcomponents: Subcomponent[] = [];
  let fieldStart = from;
  let repetitionStart = from;
  let componentStart = from;
  let subcomponentStart = from;
  let escaped = false;

  for (let index = from; index <= end; index++) {
    const code = index < end ? input.charCodeAt(index) : undefined;
    if (code === escapeCode) {
      escaped = true;
      continue;
    }
    const level = code === undefined ? Level.Field : levelOf(code);
    if (level === Level.None) continue;

    const span = { start: subcomponentStart, end: index };
    subcomponents.push(
      escaped
        ? decodedValue(parser, span, {
            field: firstFieldNumber + fields.length,
            repetition: repetitions.length + 1,
            component: components.length + 1,
            subcomponent: subcomponents.length + 1,
          })
        : plainSubcomponent(input, span),
    );
    subcomponentStart = index + 1;
    escaped = false;
    if (level === Level.Subcomponent) continue;

    components.push({
      subcomponents: withoutTrailing(
        subcomponents,
        (node) => node.kind === "empty",
      ),
      span: { start: componentStart, end: index },
    });
    subcomponents = [];
    componentStart = index + 1;
    if (level === Level.Component) continue;

    repetitions.push({
      components: withoutTrailing(
        components,
        (node) => node.subcomponents.length === 0,
      ),
      span: { start: repetitionStart, end: index },
    });
    components = [];
    repetitionStart = index + 1;
    if (level === Level.Repetition) continue;

    fields.push({
      repetitions: withoutTrailing(
        repetitions,
        (node) => node.components.length === 0,
      ),
      span: { start: fieldStart, end: index },
    });
    repetitions = [];
    fieldStart = index + 1;
  }
  return withoutTrailing(fields, (node) => node.repetitions.length === 0);
}

function createLevelLookup(context: DecodeContext): (code: number) => Level {
  const { field, repetition, component, subcomponent } = context.delimiters;
  const fieldCode = field.charCodeAt(0);
  const repetitionCode = repetition.charCodeAt(0);
  const componentCode = component.charCodeAt(0);
  const subcomponentCode = subcomponent.charCodeAt(0);
  return (code) => {
    switch (code) {
      case fieldCode:
        return Level.Field;
      case repetitionCode:
        return Level.Repetition;
      case componentCode:
        return Level.Component;
      case subcomponentCode:
        return Level.Subcomponent;
      default:
        return Level.None;
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
type Position = Required<
  Pick<Location, "field" | "repetition" | "component" | "subcomponent">
>;

/** A subcomponent without escape sequences: empty, the HL7 null `""`, or a value taken as written. */
function plainSubcomponent(input: string, span: Span): Subcomponent {
  if (span.start === span.end) return { kind: "empty", span };
  if (span.end - span.start === 2 && input.startsWith('""', span.start)) {
    return { kind: "null", span };
  }
  return { kind: "value", value: input.slice(span.start, span.end), span };
}

/** A subcomponent with escape sequences, decoded; problems are reported at their position. */
function decodedValue(
  parser: FieldParser,
  span: Span,
  position: Position,
): Subcomponent {
  const { input } = parser;
  const decoded = decodeText(input, span, parser.context);
  for (const problem of decoded.problems) {
    parser.issues.push({
      code: problem.code,
      severity: problem.severity,
      message: problem.message,
      location: { span: problem.span, ...parser.location, ...position },
      value: input.slice(problem.span.start, problem.span.end),
    });
  }
  return { kind: "value", value: decoded.value, span };
}
