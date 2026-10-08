import { c as Span, i as Issue, r as Result } from "./result.js";
//#region src/hl7v2/model.d.ts
/**
 * The delimiters a message declares in MSH-1 and MSH-2.
 *
 * Each delimiter is a single printable ASCII punctuation character, and all of them are distinct.
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
interface Delimiters {
  /** Separates fields (MSH-1, usually `|`). */
  readonly field: string;
  /** Separates components (first character of MSH-2, usually `^`). */
  readonly component: string;
  /** Separates repetitions (second character of MSH-2, usually `~`). */
  readonly repetition: string;
  /** Starts and ends escape sequences (third character of MSH-2, usually `\`). */
  readonly escape: string;
  /** Separates subcomponents (fourth character of MSH-2, usually `&`). */
  readonly subcomponent: string;
  /**
   * Marks a value the sender truncated (fifth character of MSH-2, usually `#`). Only declared from version 2.7 on.
   * It is a marker inside values, never a separator.
   */
  readonly truncation?: string;
}
/**
 * A parsed HL7 v2 message: its delimiters, version and segments in input order.
 *
 * @example
 * ```ts
 * const pid = message.segments.find((segment) => segment.id === "PID");
 * ```
 */
interface Hl7Message {
  /** The delimiters declared in MSH-1 and MSH-2, with defaults for omitted ones. */
  readonly delimiters: Delimiters;
  /** The version ID from MSH-12.1 (for example `2.5.1`), as written; absent when MSH-12 is empty. */
  readonly version?: string;
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
interface Segment {
  /** The segment identifier, such as `PID` or `ZPI`, as written. */
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
interface Field {
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
interface Repetition {
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
interface Component {
  /** The subcomponents in input order; `subcomponents[n - 1]` is subcomponent `n`. */
  readonly subcomponents: readonly Subcomponent[];
  /** The component text between its delimiters. */
  readonly span: Span;
}
/**
 * A subcomponent with content.
 *
 * `value` is the decoded text: delimiter, truncation and hexadecimal escape sequences are decoded, the line break
 * commands `\.br\` and `\.sp\` become `"\n"`, and highlighting and other formatting commands are removed. Escape
 * sequences that cannot be interpreted stay verbatim. Each of these cases except plain delimiter escapes is reported
 * as an issue. The raw text is `input.slice(span.start, span.end)`.
 *
 * `value` is empty only when the raw text consists of removed formatting commands.
 *
 * @example
 * ```ts
 * if (subcomponent.kind === "value") console.log(subcomponent.value);
 * ```
 */
interface ValueSubcomponent {
  /** Discriminant: this subcomponent has content. */
  readonly kind: "value";
  /** The decoded text. */
  readonly value: string;
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
interface NullSubcomponent {
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
interface EmptySubcomponent {
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
type Subcomponent = ValueSubcomponent | NullSubcomponent | EmptySubcomponent;
//#endregion
//#region src/hl7v2/parse.d.ts
/**
 * A successfully parsed message and everything the parser tolerated or could not interpret.
 *
 * @example
 * ```ts
 * const result = parse(input);
 * if (result.ok) {
 *   const { message, issues } = result.value;
 *   console.log(message.segments.length, issues.length);
 * }
 * ```
 */
interface ParsedMessage {
  /** The message tree. */
  readonly message: Hl7Message;
  /** Remarks in input order; parsing succeeded regardless of their severity. */
  readonly issues: readonly Issue[];
}
/**
 * Why the input could not be read as an HL7 v2 message at all.
 *
 * - `EMPTY_INPUT`: there is no text once framing and whitespace are removed.
 * - `MISSING_MSH`: the first segment is not `MSH`.
 * - `INVALID_FIELD_SEPARATOR`: MSH-1 is missing or not a printable ASCII punctuation character.
 * - `INVALID_ENCODING_CHARACTERS`: MSH-2 is empty or too long, or the delimiters are not distinct punctuation
 *   characters.
 */
type ParseFailureCode = "EMPTY_INPUT" | "MISSING_MSH" | "INVALID_FIELD_SEPARATOR" | "INVALID_ENCODING_CHARACTERS";
/**
 * The reason {@link parse} failed, with the issues found up to that point.
 *
 * `issues` always ends with an `error` issue whose `code` equals the failure `code` and whose location points at the
 * offending input, so editors can underline it.
 *
 * @example
 * ```ts
 * const result = parse("PID|1");
 * if (!result.ok) console.error(result.error.code, result.error.message); // "MISSING_MSH", ...
 * ```
 */
interface ParseFailure {
  /** Discriminant: why parsing failed. */
  readonly code: ParseFailureCode;
  /** A description without message content. */
  readonly message: string;
  /** The issues found before parsing stopped, ending with the one that stopped it. */
  readonly issues: readonly Issue[];
}
/**
 * Parses an HL7 v2 message.
 *
 * Parsing is lenient (ADR 0003): segments may end with `\r`, `\n` or `\r\n`; a byte order mark, MLLP framing and
 * trailing whitespace are removed; unknown, Z and malformed segments are kept in order. Each deviation is reported in
 * `issues`. Parsing fails only when the input has no `MSH` segment first or its delimiters are unusable.
 *
 * Every node carries a span into `input`, the string passed in, even when framing was removed.
 *
 * @param input - One message as text. Use `splitBatch` for batch files or streams with several messages.
 * @returns The message and its issues, or why it could not be parsed.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam");
 * if (result.ok) {
 *   const pid = result.value.message.segments[1];
 *   const family = pid?.fields[4]?.repetitions[0]?.components[0]?.subcomponents[0];
 *   if (family?.kind === "value") console.log(family.value); // "Everyman"
 * } else {
 *   console.error(result.error.code);
 * }
 * ```
 */
export declare function parse(input: string): Result<ParsedMessage, ParseFailure>;
//#endregion
export type { Component, Delimiters, EmptySubcomponent, Field, Hl7Message, NullSubcomponent, ParseFailure, ParseFailureCode, ParsedMessage, Repetition, Segment, Subcomponent, ValueSubcomponent };