// The parsed message is plain readonly data: it survives structuredClone, postMessage and JSON, and every accessor
// is a function over it (ADR 0008).
import type { Span } from "../shared/issue";

/**
 * The delimiters a message declares in MSH-1 and MSH-2.
 *
 * MSH-2 lists the encoding characters by position: component, repetition, escape, subcomponent and, from version 2.7
 * on, truncation. The standard lets a message omit the trailing ones it does not use. An omitted delimiter is
 * `undefined` and has no effect: without a subcomponent separator values are not split into subcomponents, and without
 * an escape character they contain no escape sequences. Each declared delimiter is a single printable ASCII character
 * that is neither a letter nor a digit, and all of them are distinct.
 *
 * @example
 * ```ts
 * // MSH|^~\&|...
 * const standard: Delimiters = {
 *   field: "|",
 *   component: "^",
 *   repetition: "~",
 *   escape: "\\",
 *   subcomponent: "&",
 * };
 * ```
 */
export interface Delimiters {
  /** Separates fields (MSH-1, usually `|`). */
  readonly field: string;
  /** Separates components (first character of MSH-2, usually `^`). */
  readonly component: string;
  /** Separates repetitions (second character of MSH-2, usually `~`). */
  readonly repetition: string;
  /** Starts and ends escape sequences (third character of MSH-2, usually `\`); `undefined` when MSH-2 omits it. */
  readonly escape?: string | undefined;
  /** Separates subcomponents (fourth character of MSH-2, usually `&`); `undefined` when MSH-2 omits it. */
  readonly subcomponent?: string | undefined;
  /**
   * Marks a value the sender truncated (fifth character of MSH-2, usually `#`). Only declared from version 2.7 on;
   * `undefined` otherwise. It is a marker inside values, never a separator.
   */
  readonly truncation?: string | undefined;
}

/**
 * A parsed HL7 v2 message: its delimiters, version and segments in input order.
 *
 * @example
 * ```ts
 * const pid = message.segments.find((segment) => segment.id === "PID");
 * ```
 */
export interface Hl7Message {
  /** The delimiters declared in MSH-1 and MSH-2. */
  readonly delimiters: Delimiters;
  /**
   * The version ID (for example `2.5.1`): the raw text of the first component of the first repetition of MSH-12,
   * without unescaping; absent when it is empty. MSH-18, the character set, is read the same way.
   */
  readonly version?: string | undefined;
  /** Every segment in input order, including Z segments and segments with unknown identifiers. */
  readonly segments: readonly Segment[];
}

/**
 * One segment: a line of the message such as `PID|1||...`.
 *
 * `fields` is a 0-based array, so **`fields[n - 1]` is field `n`** in HL7 notation: `PID-5` is `fields[4]`. In MSH,
 * `fields[0]` is MSH-1 (the field separator itself) and `fields[1]` is MSH-2 (the encoding characters, never split
 * or unescaped), so the numbering is the same for every segment.
 *
 * Trailing empty fields are not represented; `span` still covers them.
 *
 * @example
 * ```ts
 * // PID-5: patient name
 * const name = pid.fields[5 - 1];
 * ```
 */
export interface Segment {
  /**
   * The segment identifier, such as `PID` or `ZPI`, as written: the text before the first field separator. For a line
   * without a field separator, it is the whole line (reported as `INVALID_SEGMENT_ID` unless it is a valid identifier).
   */
  readonly id: string;
  /** The fields after the identifier; `fields[n - 1]` is field `n`. */
  readonly fields: readonly Field[];
  /** The segment text without its terminator. */
  readonly span: Span;
}

/**
 * A field: one or more repetitions separated by the repetition delimiter.
 *
 * An empty field has no repetitions. Trailing empty repetitions are not represented; `span` still covers them.
 *
 * @example
 * ```ts
 * // Every repetition of PID-3, the patient identifier list
 * for (const identifier of pid.fields[3 - 1]?.repetitions ?? []) console.log(identifier.components.length);
 * ```
 */
export interface Field {
  /** The repetitions in input order. */
  readonly repetitions: readonly Repetition[];
  /** The field text between its field delimiters. */
  readonly span: Span;
}

/**
 * One repetition of a field: components separated by the component delimiter.
 *
 * An empty repetition has no components. Trailing empty components are not represented; `span` still covers them.
 *
 * @example
 * ```ts
 * // XPN.1 family name of the first repetition of PID-5
 * const family = pid.fields[4]?.repetitions[0]?.components[0];
 * ```
 */
export interface Repetition {
  /** The components in input order; `components[n - 1]` is component `n`. */
  readonly components: readonly Component[];
  /** The repetition text between its delimiters. */
  readonly span: Span;
}

/**
 * One component: subcomponents separated by the subcomponent delimiter.
 *
 * An empty component has no subcomponents. Trailing empty subcomponents are not represented; `span` still covers
 * them.
 *
 * @example
 * ```ts
 * const first = component.subcomponents[0];
 * if (first?.kind === "value") console.log(first.value);
 * ```
 */
export interface Component {
  /** The subcomponents in input order; `subcomponents[n - 1]` is subcomponent `n`. */
  readonly subcomponents: readonly Subcomponent[];
  /** The component text between its delimiters. */
  readonly span: Span;
}

/**
 * A subcomponent with content.
 *
 * `value` is the decoded text: delimiter, truncation and hexadecimal escape sequences are decoded, the line break
 * commands `\.br\`, `\.sp\` and `\.ce\` become `"\n"`, and highlighting and other formatting commands are removed. Escape
 * sequences that cannot be interpreted stay verbatim. Each of these cases except plain delimiter escapes is reported
 * as an issue. The raw text is `input.slice(span.start, span.end)`.
 *
 * A value that ends with the truncation character MSH-2 declares (version 2.7 and later), outside an escape sequence,
 * was cut off by the sender: `truncated` is `true`, the character is not part of `value`, and an info issue
 * (`VALUE_TRUNCATED`) reports it. `\P\` stands for the truncation character as content.
 *
 * `value` is empty only when the raw text consists of removed formatting commands or of the truncation character.
 *
 * @example
 * ```ts
 * if (subcomponent.kind === "value") console.log(subcomponent.value);
 * ```
 */
export interface ValueSubcomponent {
  /** Discriminant: this subcomponent has content. */
  readonly kind: "value";
  /**
   * The decoded text. It may contain any character the input or a hexadecimal escape holds, including NUL, other
   * control characters and lone surrogates, without an issue; check before passing it on where they are not allowed.
   */
  readonly value: string;
  /** `true` when the sender truncated the value; absent otherwise. */
  readonly truncated?: true | undefined;
  /** The raw text, escape sequences included. */
  readonly span: Span;
}

/**
 * The explicit HL7 null `""`: the sender states that the value is null (for example, to delete it in the
 * receiving system). It differs from an empty value, which means "not sent".
 *
 * @example
 * ```ts
 * const deleted = subcomponent.kind === "null";
 * ```
 */
export interface NullSubcomponent {
  /** Discriminant: this subcomponent is the explicit null `""`. */
  readonly kind: "null";
  /** The two quote characters. */
  readonly span: Span;
}

/**
 * An empty subcomponent between two subcomponent delimiters, as in `a&&c`.
 *
 * Empty fields, repetitions and components are represented by empty child arrays; only subcomponents, which have no
 * children, need a node of their own to keep the positions of later siblings.
 *
 * @example
 * ```ts
 * const present = subcomponent.kind !== "empty";
 * ```
 */
export interface EmptySubcomponent {
  /** Discriminant: this subcomponent has no content. */
  readonly kind: "empty";
  /** An empty range at the position of the subcomponent. */
  readonly span: Span;
}

/**
 * The smallest unit of a message: a value, the explicit null `""`, or nothing.
 *
 * @example
 * ```ts
 * function text(subcomponent: Subcomponent): string | undefined {
 *   return subcomponent.kind === "value" ? subcomponent.value : undefined;
 * }
 * ```
 */
export type Subcomponent =
  ValueSubcomponent | NullSubcomponent | EmptySubcomponent;
