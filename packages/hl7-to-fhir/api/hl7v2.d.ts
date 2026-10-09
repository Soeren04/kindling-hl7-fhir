import { c as Span, i as Issue, o as Location, r as Result } from "./result.js";
//#region src/hl7v2/model.d.ts
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
 * import type { Delimiters } from "hl7-to-fhir/hl7v2";
 *
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
 * import type { Hl7Message } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 *
 * const pid = message.segments.find((segment) => segment.id === "PID");
 * ```
 */
interface Hl7Message {
  /** The delimiters declared in MSH-1 and MSH-2. */
  readonly delimiters: Delimiters;
  /**
   * The version ID (for example `2.5.1`): the value of MSH-12.1, the first subcomponent of the first component of the
   * first repetition of MSH-12, decoded like every value; absent when that position holds no text.
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
 * import type { Segment } from "hl7-to-fhir/hl7v2";
 *
 * declare const pid: Segment;
 *
 * // PID-5: patient name
 * const name = pid.fields[5 - 1];
 * ```
 */
interface Segment {
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
 * import type { Segment } from "hl7-to-fhir/hl7v2";
 *
 * declare const pid: Segment;
 *
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
 * import type { Segment } from "hl7-to-fhir/hl7v2";
 *
 * declare const pid: Segment;
 *
 * // The first component (XPN.1, the family name) of the first repetition of PID-5
 * const family = pid.fields[5 - 1]?.repetitions[0]?.components[1 - 1];
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
 * import type { Component } from "hl7-to-fhir/hl7v2";
 *
 * declare const component: Component;
 *
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
 * import type { Subcomponent } from "hl7-to-fhir/hl7v2";
 *
 * declare const subcomponent: Subcomponent;
 *
 * if (subcomponent.kind === "value") console.log(subcomponent.value);
 * ```
 */
interface ValueSubcomponent {
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
 * import type { Subcomponent } from "hl7-to-fhir/hl7v2";
 *
 * declare const subcomponent: Subcomponent;
 *
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
 * import type { Subcomponent } from "hl7-to-fhir/hl7v2";
 *
 * declare const subcomponent: Subcomponent;
 *
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
 * import type { Subcomponent } from "hl7-to-fhir/hl7v2";
 *
 * function text(subcomponent: Subcomponent): string | undefined {
 *   return subcomponent.kind === "value" ? subcomponent.value : undefined;
 * }
 * ```
 */
type Subcomponent = ValueSubcomponent | NullSubcomponent | EmptySubcomponent;
//#endregion
//#region src/hl7v2/known-paths.d.ts
/**
 * Every field and component of the segments the library defines, in HL7 notation: `PID.5` and `PID.5.1`.
 * Editors offer these when a path is typed; `get`, `getAll` and `isNull` accept any other well-formed path as well.
 *
 * @example
 * ```ts
 * import type { KnownPath } from "hl7-to-fhir/hl7v2";
 *
 * const name: KnownPath = "PID.5.1";
 * ```
 */
type KnownPath =
  | "MSH.1"
  | "MSH.2"
  | "MSH.3"
  | "MSH.3.1"
  | "MSH.3.2"
  | "MSH.3.3"
  | "MSH.4"
  | "MSH.4.1"
  | "MSH.4.2"
  | "MSH.4.3"
  | "MSH.5"
  | "MSH.5.1"
  | "MSH.5.2"
  | "MSH.5.3"
  | "MSH.6"
  | "MSH.6.1"
  | "MSH.6.2"
  | "MSH.6.3"
  | "MSH.7"
  | "MSH.7.1"
  | "MSH.7.2"
  | "MSH.8"
  | "MSH.9"
  | "MSH.9.1"
  | "MSH.9.2"
  | "MSH.9.3"
  | "MSH.10"
  | "MSH.11"
  | "MSH.11.1"
  | "MSH.11.2"
  | "MSH.12"
  | "MSH.12.1"
  | "MSH.12.2"
  | "MSH.12.3"
  | "MSH.13"
  | "MSH.14"
  | "MSH.15"
  | "MSH.16"
  | "MSH.17"
  | "MSH.18"
  | "MSH.19"
  | "MSH.19.1"
  | "MSH.19.2"
  | "MSH.19.3"
  | "MSH.19.4"
  | "MSH.19.5"
  | "MSH.19.6"
  | "MSH.20"
  | "MSH.21"
  | "MSH.21.1"
  | "MSH.21.2"
  | "MSH.21.3"
  | "MSH.21.4"
  | "EVN.1"
  | "EVN.2"
  | "EVN.2.1"
  | "EVN.2.2"
  | "EVN.3"
  | "EVN.3.1"
  | "EVN.3.2"
  | "EVN.4"
  | "EVN.5"
  | "EVN.5.1"
  | "EVN.5.2"
  | "EVN.5.3"
  | "EVN.5.4"
  | "EVN.5.5"
  | "EVN.5.6"
  | "EVN.5.7"
  | "EVN.5.8"
  | "EVN.5.9"
  | "EVN.5.10"
  | "EVN.5.11"
  | "EVN.5.12"
  | "EVN.5.13"
  | "EVN.5.14"
  | "EVN.5.15"
  | "EVN.5.16"
  | "EVN.5.17"
  | "EVN.5.18"
  | "EVN.5.19"
  | "EVN.5.20"
  | "EVN.5.21"
  | "EVN.5.22"
  | "EVN.5.23"
  | "EVN.6"
  | "EVN.6.1"
  | "EVN.6.2"
  | "EVN.7"
  | "EVN.7.1"
  | "EVN.7.2"
  | "EVN.7.3"
  | "PID.1"
  | "PID.2"
  | "PID.2.1"
  | "PID.2.2"
  | "PID.2.3"
  | "PID.2.4"
  | "PID.2.5"
  | "PID.2.6"
  | "PID.2.7"
  | "PID.2.8"
  | "PID.2.9"
  | "PID.2.10"
  | "PID.3"
  | "PID.3.1"
  | "PID.3.2"
  | "PID.3.3"
  | "PID.3.4"
  | "PID.3.5"
  | "PID.3.6"
  | "PID.3.7"
  | "PID.3.8"
  | "PID.3.9"
  | "PID.3.10"
  | "PID.4"
  | "PID.4.1"
  | "PID.4.2"
  | "PID.4.3"
  | "PID.4.4"
  | "PID.4.5"
  | "PID.4.6"
  | "PID.4.7"
  | "PID.4.8"
  | "PID.4.9"
  | "PID.4.10"
  | "PID.5"
  | "PID.5.1"
  | "PID.5.2"
  | "PID.5.3"
  | "PID.5.4"
  | "PID.5.5"
  | "PID.5.6"
  | "PID.5.7"
  | "PID.5.8"
  | "PID.5.9"
  | "PID.5.10"
  | "PID.5.11"
  | "PID.5.12"
  | "PID.5.13"
  | "PID.5.14"
  | "PID.6"
  | "PID.6.1"
  | "PID.6.2"
  | "PID.6.3"
  | "PID.6.4"
  | "PID.6.5"
  | "PID.6.6"
  | "PID.6.7"
  | "PID.6.8"
  | "PID.6.9"
  | "PID.6.10"
  | "PID.6.11"
  | "PID.6.12"
  | "PID.6.13"
  | "PID.6.14"
  | "PID.7"
  | "PID.7.1"
  | "PID.7.2"
  | "PID.8"
  | "PID.9"
  | "PID.9.1"
  | "PID.9.2"
  | "PID.9.3"
  | "PID.9.4"
  | "PID.9.5"
  | "PID.9.6"
  | "PID.9.7"
  | "PID.9.8"
  | "PID.9.9"
  | "PID.9.10"
  | "PID.9.11"
  | "PID.9.12"
  | "PID.9.13"
  | "PID.9.14"
  | "PID.10"
  | "PID.10.1"
  | "PID.10.2"
  | "PID.10.3"
  | "PID.10.4"
  | "PID.10.5"
  | "PID.10.6"
  | "PID.11"
  | "PID.11.1"
  | "PID.11.2"
  | "PID.11.3"
  | "PID.11.4"
  | "PID.11.5"
  | "PID.11.6"
  | "PID.11.7"
  | "PID.11.8"
  | "PID.11.9"
  | "PID.11.10"
  | "PID.11.11"
  | "PID.11.12"
  | "PID.11.13"
  | "PID.11.14"
  | "PID.12"
  | "PID.13"
  | "PID.13.1"
  | "PID.13.2"
  | "PID.13.3"
  | "PID.13.4"
  | "PID.13.5"
  | "PID.13.6"
  | "PID.13.7"
  | "PID.13.8"
  | "PID.13.9"
  | "PID.13.10"
  | "PID.13.11"
  | "PID.13.12"
  | "PID.14"
  | "PID.14.1"
  | "PID.14.2"
  | "PID.14.3"
  | "PID.14.4"
  | "PID.14.5"
  | "PID.14.6"
  | "PID.14.7"
  | "PID.14.8"
  | "PID.14.9"
  | "PID.14.10"
  | "PID.14.11"
  | "PID.14.12"
  | "PID.15"
  | "PID.15.1"
  | "PID.15.2"
  | "PID.15.3"
  | "PID.15.4"
  | "PID.15.5"
  | "PID.15.6"
  | "PID.16"
  | "PID.16.1"
  | "PID.16.2"
  | "PID.16.3"
  | "PID.16.4"
  | "PID.16.5"
  | "PID.16.6"
  | "PID.17"
  | "PID.17.1"
  | "PID.17.2"
  | "PID.17.3"
  | "PID.17.4"
  | "PID.17.5"
  | "PID.17.6"
  | "PID.18"
  | "PID.18.1"
  | "PID.18.2"
  | "PID.18.3"
  | "PID.18.4"
  | "PID.18.5"
  | "PID.18.6"
  | "PID.18.7"
  | "PID.18.8"
  | "PID.18.9"
  | "PID.18.10"
  | "PID.19"
  | "PID.20"
  | "PID.20.1"
  | "PID.20.2"
  | "PID.20.3"
  | "PID.21"
  | "PID.21.1"
  | "PID.21.2"
  | "PID.21.3"
  | "PID.21.4"
  | "PID.21.5"
  | "PID.21.6"
  | "PID.21.7"
  | "PID.21.8"
  | "PID.21.9"
  | "PID.21.10"
  | "PID.22"
  | "PID.22.1"
  | "PID.22.2"
  | "PID.22.3"
  | "PID.22.4"
  | "PID.22.5"
  | "PID.22.6"
  | "PID.23"
  | "PID.24"
  | "PID.25"
  | "PID.26"
  | "PID.26.1"
  | "PID.26.2"
  | "PID.26.3"
  | "PID.26.4"
  | "PID.26.5"
  | "PID.26.6"
  | "PID.27"
  | "PID.27.1"
  | "PID.27.2"
  | "PID.27.3"
  | "PID.27.4"
  | "PID.27.5"
  | "PID.27.6"
  | "PID.28"
  | "PID.28.1"
  | "PID.28.2"
  | "PID.28.3"
  | "PID.28.4"
  | "PID.28.5"
  | "PID.28.6"
  | "PID.29"
  | "PID.29.1"
  | "PID.29.2"
  | "PID.30"
  | "PID.31"
  | "PID.32"
  | "PID.33"
  | "PID.33.1"
  | "PID.33.2"
  | "PID.34"
  | "PID.34.1"
  | "PID.34.2"
  | "PID.34.3"
  | "PID.35"
  | "PID.35.1"
  | "PID.35.2"
  | "PID.35.3"
  | "PID.35.4"
  | "PID.35.5"
  | "PID.35.6"
  | "PID.36"
  | "PID.36.1"
  | "PID.36.2"
  | "PID.36.3"
  | "PID.36.4"
  | "PID.36.5"
  | "PID.36.6"
  | "PID.37"
  | "PID.38"
  | "PID.38.1"
  | "PID.38.2"
  | "PID.38.3"
  | "PID.38.4"
  | "PID.38.5"
  | "PID.38.6"
  | "PID.39"
  | "PID.39.1"
  | "PID.39.2"
  | "PID.39.3"
  | "PID.39.4"
  | "PID.39.5"
  | "PID.39.6"
  | "PID.39.7"
  | "PID.39.8"
  | "PID.39.9"
  | "PD1.1"
  | "PD1.2"
  | "PD1.3"
  | "PD1.3.1"
  | "PD1.3.2"
  | "PD1.3.3"
  | "PD1.3.4"
  | "PD1.3.5"
  | "PD1.3.6"
  | "PD1.3.7"
  | "PD1.3.8"
  | "PD1.3.9"
  | "PD1.3.10"
  | "PD1.4"
  | "PD1.4.1"
  | "PD1.4.2"
  | "PD1.4.3"
  | "PD1.4.4"
  | "PD1.4.5"
  | "PD1.4.6"
  | "PD1.4.7"
  | "PD1.4.8"
  | "PD1.4.9"
  | "PD1.4.10"
  | "PD1.4.11"
  | "PD1.4.12"
  | "PD1.4.13"
  | "PD1.4.14"
  | "PD1.4.15"
  | "PD1.4.16"
  | "PD1.4.17"
  | "PD1.4.18"
  | "PD1.4.19"
  | "PD1.4.20"
  | "PD1.4.21"
  | "PD1.4.22"
  | "PD1.4.23"
  | "PD1.5"
  | "PD1.6"
  | "PD1.7"
  | "PD1.8"
  | "PD1.9"
  | "PD1.10"
  | "PD1.10.1"
  | "PD1.10.2"
  | "PD1.10.3"
  | "PD1.10.4"
  | "PD1.10.5"
  | "PD1.10.6"
  | "PD1.10.7"
  | "PD1.10.8"
  | "PD1.10.9"
  | "PD1.10.10"
  | "PD1.11"
  | "PD1.11.1"
  | "PD1.11.2"
  | "PD1.11.3"
  | "PD1.11.4"
  | "PD1.11.5"
  | "PD1.11.6"
  | "PD1.12"
  | "PD1.13"
  | "PD1.14"
  | "PD1.14.1"
  | "PD1.14.2"
  | "PD1.14.3"
  | "PD1.14.4"
  | "PD1.14.5"
  | "PD1.14.6"
  | "PD1.14.7"
  | "PD1.14.8"
  | "PD1.14.9"
  | "PD1.14.10"
  | "PD1.15"
  | "PD1.15.1"
  | "PD1.15.2"
  | "PD1.15.3"
  | "PD1.15.4"
  | "PD1.15.5"
  | "PD1.15.6"
  | "PD1.16"
  | "PD1.17"
  | "PD1.18"
  | "PD1.19"
  | "PD1.20"
  | "PD1.21"
  | "PV1.1"
  | "PV1.2"
  | "PV1.3"
  | "PV1.3.1"
  | "PV1.3.2"
  | "PV1.3.3"
  | "PV1.3.4"
  | "PV1.3.5"
  | "PV1.3.6"
  | "PV1.3.7"
  | "PV1.3.8"
  | "PV1.3.9"
  | "PV1.3.10"
  | "PV1.3.11"
  | "PV1.4"
  | "PV1.5"
  | "PV1.5.1"
  | "PV1.5.2"
  | "PV1.5.3"
  | "PV1.5.4"
  | "PV1.5.5"
  | "PV1.5.6"
  | "PV1.5.7"
  | "PV1.5.8"
  | "PV1.5.9"
  | "PV1.5.10"
  | "PV1.6"
  | "PV1.6.1"
  | "PV1.6.2"
  | "PV1.6.3"
  | "PV1.6.4"
  | "PV1.6.5"
  | "PV1.6.6"
  | "PV1.6.7"
  | "PV1.6.8"
  | "PV1.6.9"
  | "PV1.6.10"
  | "PV1.6.11"
  | "PV1.7"
  | "PV1.7.1"
  | "PV1.7.2"
  | "PV1.7.3"
  | "PV1.7.4"
  | "PV1.7.5"
  | "PV1.7.6"
  | "PV1.7.7"
  | "PV1.7.8"
  | "PV1.7.9"
  | "PV1.7.10"
  | "PV1.7.11"
  | "PV1.7.12"
  | "PV1.7.13"
  | "PV1.7.14"
  | "PV1.7.15"
  | "PV1.7.16"
  | "PV1.7.17"
  | "PV1.7.18"
  | "PV1.7.19"
  | "PV1.7.20"
  | "PV1.7.21"
  | "PV1.7.22"
  | "PV1.7.23"
  | "PV1.8"
  | "PV1.8.1"
  | "PV1.8.2"
  | "PV1.8.3"
  | "PV1.8.4"
  | "PV1.8.5"
  | "PV1.8.6"
  | "PV1.8.7"
  | "PV1.8.8"
  | "PV1.8.9"
  | "PV1.8.10"
  | "PV1.8.11"
  | "PV1.8.12"
  | "PV1.8.13"
  | "PV1.8.14"
  | "PV1.8.15"
  | "PV1.8.16"
  | "PV1.8.17"
  | "PV1.8.18"
  | "PV1.8.19"
  | "PV1.8.20"
  | "PV1.8.21"
  | "PV1.8.22"
  | "PV1.8.23"
  | "PV1.9"
  | "PV1.9.1"
  | "PV1.9.2"
  | "PV1.9.3"
  | "PV1.9.4"
  | "PV1.9.5"
  | "PV1.9.6"
  | "PV1.9.7"
  | "PV1.9.8"
  | "PV1.9.9"
  | "PV1.9.10"
  | "PV1.9.11"
  | "PV1.9.12"
  | "PV1.9.13"
  | "PV1.9.14"
  | "PV1.9.15"
  | "PV1.9.16"
  | "PV1.9.17"
  | "PV1.9.18"
  | "PV1.9.19"
  | "PV1.9.20"
  | "PV1.9.21"
  | "PV1.9.22"
  | "PV1.9.23"
  | "PV1.10"
  | "PV1.11"
  | "PV1.11.1"
  | "PV1.11.2"
  | "PV1.11.3"
  | "PV1.11.4"
  | "PV1.11.5"
  | "PV1.11.6"
  | "PV1.11.7"
  | "PV1.11.8"
  | "PV1.11.9"
  | "PV1.11.10"
  | "PV1.11.11"
  | "PV1.12"
  | "PV1.13"
  | "PV1.14"
  | "PV1.15"
  | "PV1.16"
  | "PV1.17"
  | "PV1.17.1"
  | "PV1.17.2"
  | "PV1.17.3"
  | "PV1.17.4"
  | "PV1.17.5"
  | "PV1.17.6"
  | "PV1.17.7"
  | "PV1.17.8"
  | "PV1.17.9"
  | "PV1.17.10"
  | "PV1.17.11"
  | "PV1.17.12"
  | "PV1.17.13"
  | "PV1.17.14"
  | "PV1.17.15"
  | "PV1.17.16"
  | "PV1.17.17"
  | "PV1.17.18"
  | "PV1.17.19"
  | "PV1.17.20"
  | "PV1.17.21"
  | "PV1.17.22"
  | "PV1.17.23"
  | "PV1.18"
  | "PV1.19"
  | "PV1.19.1"
  | "PV1.19.2"
  | "PV1.19.3"
  | "PV1.19.4"
  | "PV1.19.5"
  | "PV1.19.6"
  | "PV1.19.7"
  | "PV1.19.8"
  | "PV1.19.9"
  | "PV1.19.10"
  | "PV1.20"
  | "PV1.20.1"
  | "PV1.20.2"
  | "PV1.21"
  | "PV1.22"
  | "PV1.23"
  | "PV1.24"
  | "PV1.25"
  | "PV1.26"
  | "PV1.27"
  | "PV1.28"
  | "PV1.29"
  | "PV1.30"
  | "PV1.31"
  | "PV1.32"
  | "PV1.33"
  | "PV1.34"
  | "PV1.35"
  | "PV1.36"
  | "PV1.37"
  | "PV1.37.1"
  | "PV1.37.2"
  | "PV1.38"
  | "PV1.38.1"
  | "PV1.38.2"
  | "PV1.38.3"
  | "PV1.38.4"
  | "PV1.38.5"
  | "PV1.38.6"
  | "PV1.39"
  | "PV1.40"
  | "PV1.41"
  | "PV1.42"
  | "PV1.42.1"
  | "PV1.42.2"
  | "PV1.42.3"
  | "PV1.42.4"
  | "PV1.42.5"
  | "PV1.42.6"
  | "PV1.42.7"
  | "PV1.42.8"
  | "PV1.42.9"
  | "PV1.42.10"
  | "PV1.42.11"
  | "PV1.43"
  | "PV1.43.1"
  | "PV1.43.2"
  | "PV1.43.3"
  | "PV1.43.4"
  | "PV1.43.5"
  | "PV1.43.6"
  | "PV1.43.7"
  | "PV1.43.8"
  | "PV1.43.9"
  | "PV1.43.10"
  | "PV1.43.11"
  | "PV1.44"
  | "PV1.44.1"
  | "PV1.44.2"
  | "PV1.45"
  | "PV1.45.1"
  | "PV1.45.2"
  | "PV1.46"
  | "PV1.47"
  | "PV1.48"
  | "PV1.49"
  | "PV1.50"
  | "PV1.50.1"
  | "PV1.50.2"
  | "PV1.50.3"
  | "PV1.50.4"
  | "PV1.50.5"
  | "PV1.50.6"
  | "PV1.50.7"
  | "PV1.50.8"
  | "PV1.50.9"
  | "PV1.50.10"
  | "PV1.51"
  | "PV1.52"
  | "PV1.52.1"
  | "PV1.52.2"
  | "PV1.52.3"
  | "PV1.52.4"
  | "PV1.52.5"
  | "PV1.52.6"
  | "PV1.52.7"
  | "PV1.52.8"
  | "PV1.52.9"
  | "PV1.52.10"
  | "PV1.52.11"
  | "PV1.52.12"
  | "PV1.52.13"
  | "PV1.52.14"
  | "PV1.52.15"
  | "PV1.52.16"
  | "PV1.52.17"
  | "PV1.52.18"
  | "PV1.52.19"
  | "PV1.52.20"
  | "PV1.52.21"
  | "PV1.52.22"
  | "PV1.52.23"
  | "PV2.1"
  | "PV2.1.1"
  | "PV2.1.2"
  | "PV2.1.3"
  | "PV2.1.4"
  | "PV2.1.5"
  | "PV2.1.6"
  | "PV2.1.7"
  | "PV2.1.8"
  | "PV2.1.9"
  | "PV2.1.10"
  | "PV2.1.11"
  | "PV2.2"
  | "PV2.2.1"
  | "PV2.2.2"
  | "PV2.2.3"
  | "PV2.2.4"
  | "PV2.2.5"
  | "PV2.2.6"
  | "PV2.3"
  | "PV2.3.1"
  | "PV2.3.2"
  | "PV2.3.3"
  | "PV2.3.4"
  | "PV2.3.5"
  | "PV2.3.6"
  | "PV2.4"
  | "PV2.4.1"
  | "PV2.4.2"
  | "PV2.4.3"
  | "PV2.4.4"
  | "PV2.4.5"
  | "PV2.4.6"
  | "PV2.5"
  | "PV2.6"
  | "PV2.7"
  | "PV2.8"
  | "PV2.8.1"
  | "PV2.8.2"
  | "PV2.9"
  | "PV2.9.1"
  | "PV2.9.2"
  | "PV2.10"
  | "PV2.11"
  | "PV2.12"
  | "PV2.13"
  | "PV2.13.1"
  | "PV2.13.2"
  | "PV2.13.3"
  | "PV2.13.4"
  | "PV2.13.5"
  | "PV2.13.6"
  | "PV2.13.7"
  | "PV2.13.8"
  | "PV2.13.9"
  | "PV2.13.10"
  | "PV2.13.11"
  | "PV2.13.12"
  | "PV2.13.13"
  | "PV2.13.14"
  | "PV2.13.15"
  | "PV2.13.16"
  | "PV2.13.17"
  | "PV2.13.18"
  | "PV2.13.19"
  | "PV2.13.20"
  | "PV2.13.21"
  | "PV2.13.22"
  | "PV2.13.23"
  | "PV2.14"
  | "PV2.15"
  | "PV2.16"
  | "PV2.17"
  | "PV2.18"
  | "PV2.19"
  | "PV2.20"
  | "PV2.21"
  | "PV2.22"
  | "PV2.23"
  | "PV2.23.1"
  | "PV2.23.2"
  | "PV2.23.3"
  | "PV2.23.4"
  | "PV2.23.5"
  | "PV2.23.6"
  | "PV2.23.7"
  | "PV2.23.8"
  | "PV2.23.9"
  | "PV2.23.10"
  | "PV2.24"
  | "PV2.25"
  | "PV2.26"
  | "PV2.27"
  | "PV2.28"
  | "PV2.29"
  | "PV2.30"
  | "PV2.30.1"
  | "PV2.30.2"
  | "PV2.30.3"
  | "PV2.30.4"
  | "PV2.30.5"
  | "PV2.30.6"
  | "PV2.31"
  | "PV2.32"
  | "PV2.33"
  | "PV2.33.1"
  | "PV2.33.2"
  | "PV2.34"
  | "PV2.35"
  | "PV2.36"
  | "PV2.37"
  | "PV2.38"
  | "PV2.38.1"
  | "PV2.38.2"
  | "PV2.38.3"
  | "PV2.38.4"
  | "PV2.38.5"
  | "PV2.38.6"
  | "PV2.39"
  | "PV2.39.1"
  | "PV2.39.2"
  | "PV2.39.3"
  | "PV2.39.4"
  | "PV2.39.5"
  | "PV2.39.6"
  | "PV2.40"
  | "PV2.40.1"
  | "PV2.40.2"
  | "PV2.40.3"
  | "PV2.40.4"
  | "PV2.40.5"
  | "PV2.40.6"
  | "PV2.41"
  | "PV2.41.1"
  | "PV2.41.2"
  | "PV2.41.3"
  | "PV2.41.4"
  | "PV2.41.5"
  | "PV2.41.6"
  | "PV2.42"
  | "PV2.42.1"
  | "PV2.42.2"
  | "PV2.42.3"
  | "PV2.42.4"
  | "PV2.42.5"
  | "PV2.42.6"
  | "PV2.43"
  | "PV2.44"
  | "PV2.45"
  | "PV2.45.1"
  | "PV2.45.2"
  | "PV2.45.3"
  | "PV2.45.4"
  | "PV2.45.5"
  | "PV2.45.6"
  | "PV2.46"
  | "PV2.47"
  | "PV2.47.1"
  | "PV2.47.2"
  | "PV2.48"
  | "PV2.48.1"
  | "PV2.48.2"
  | "PV2.49"
  | "ORC.1"
  | "ORC.2"
  | "ORC.2.1"
  | "ORC.2.2"
  | "ORC.2.3"
  | "ORC.2.4"
  | "ORC.3"
  | "ORC.3.1"
  | "ORC.3.2"
  | "ORC.3.3"
  | "ORC.3.4"
  | "ORC.4"
  | "ORC.4.1"
  | "ORC.4.2"
  | "ORC.4.3"
  | "ORC.4.4"
  | "ORC.5"
  | "ORC.6"
  | "ORC.7"
  | "ORC.7.1"
  | "ORC.7.2"
  | "ORC.7.3"
  | "ORC.7.4"
  | "ORC.7.5"
  | "ORC.7.6"
  | "ORC.7.7"
  | "ORC.7.8"
  | "ORC.7.9"
  | "ORC.7.10"
  | "ORC.7.11"
  | "ORC.7.12"
  | "ORC.8"
  | "ORC.8.1"
  | "ORC.8.2"
  | "ORC.9"
  | "ORC.9.1"
  | "ORC.9.2"
  | "ORC.10"
  | "ORC.10.1"
  | "ORC.10.2"
  | "ORC.10.3"
  | "ORC.10.4"
  | "ORC.10.5"
  | "ORC.10.6"
  | "ORC.10.7"
  | "ORC.10.8"
  | "ORC.10.9"
  | "ORC.10.10"
  | "ORC.10.11"
  | "ORC.10.12"
  | "ORC.10.13"
  | "ORC.10.14"
  | "ORC.10.15"
  | "ORC.10.16"
  | "ORC.10.17"
  | "ORC.10.18"
  | "ORC.10.19"
  | "ORC.10.20"
  | "ORC.10.21"
  | "ORC.10.22"
  | "ORC.10.23"
  | "ORC.11"
  | "ORC.11.1"
  | "ORC.11.2"
  | "ORC.11.3"
  | "ORC.11.4"
  | "ORC.11.5"
  | "ORC.11.6"
  | "ORC.11.7"
  | "ORC.11.8"
  | "ORC.11.9"
  | "ORC.11.10"
  | "ORC.11.11"
  | "ORC.11.12"
  | "ORC.11.13"
  | "ORC.11.14"
  | "ORC.11.15"
  | "ORC.11.16"
  | "ORC.11.17"
  | "ORC.11.18"
  | "ORC.11.19"
  | "ORC.11.20"
  | "ORC.11.21"
  | "ORC.11.22"
  | "ORC.11.23"
  | "ORC.12"
  | "ORC.12.1"
  | "ORC.12.2"
  | "ORC.12.3"
  | "ORC.12.4"
  | "ORC.12.5"
  | "ORC.12.6"
  | "ORC.12.7"
  | "ORC.12.8"
  | "ORC.12.9"
  | "ORC.12.10"
  | "ORC.12.11"
  | "ORC.12.12"
  | "ORC.12.13"
  | "ORC.12.14"
  | "ORC.12.15"
  | "ORC.12.16"
  | "ORC.12.17"
  | "ORC.12.18"
  | "ORC.12.19"
  | "ORC.12.20"
  | "ORC.12.21"
  | "ORC.12.22"
  | "ORC.12.23"
  | "ORC.13"
  | "ORC.13.1"
  | "ORC.13.2"
  | "ORC.13.3"
  | "ORC.13.4"
  | "ORC.13.5"
  | "ORC.13.6"
  | "ORC.13.7"
  | "ORC.13.8"
  | "ORC.13.9"
  | "ORC.13.10"
  | "ORC.13.11"
  | "ORC.14"
  | "ORC.14.1"
  | "ORC.14.2"
  | "ORC.14.3"
  | "ORC.14.4"
  | "ORC.14.5"
  | "ORC.14.6"
  | "ORC.14.7"
  | "ORC.14.8"
  | "ORC.14.9"
  | "ORC.14.10"
  | "ORC.14.11"
  | "ORC.14.12"
  | "ORC.15"
  | "ORC.15.1"
  | "ORC.15.2"
  | "ORC.16"
  | "ORC.16.1"
  | "ORC.16.2"
  | "ORC.16.3"
  | "ORC.16.4"
  | "ORC.16.5"
  | "ORC.16.6"
  | "ORC.17"
  | "ORC.17.1"
  | "ORC.17.2"
  | "ORC.17.3"
  | "ORC.17.4"
  | "ORC.17.5"
  | "ORC.17.6"
  | "ORC.18"
  | "ORC.18.1"
  | "ORC.18.2"
  | "ORC.18.3"
  | "ORC.18.4"
  | "ORC.18.5"
  | "ORC.18.6"
  | "ORC.19"
  | "ORC.19.1"
  | "ORC.19.2"
  | "ORC.19.3"
  | "ORC.19.4"
  | "ORC.19.5"
  | "ORC.19.6"
  | "ORC.19.7"
  | "ORC.19.8"
  | "ORC.19.9"
  | "ORC.19.10"
  | "ORC.19.11"
  | "ORC.19.12"
  | "ORC.19.13"
  | "ORC.19.14"
  | "ORC.19.15"
  | "ORC.19.16"
  | "ORC.19.17"
  | "ORC.19.18"
  | "ORC.19.19"
  | "ORC.19.20"
  | "ORC.19.21"
  | "ORC.19.22"
  | "ORC.19.23"
  | "ORC.20"
  | "ORC.20.1"
  | "ORC.20.2"
  | "ORC.20.3"
  | "ORC.20.4"
  | "ORC.20.5"
  | "ORC.20.6"
  | "ORC.21"
  | "ORC.21.1"
  | "ORC.21.2"
  | "ORC.21.3"
  | "ORC.21.4"
  | "ORC.21.5"
  | "ORC.21.6"
  | "ORC.21.7"
  | "ORC.21.8"
  | "ORC.21.9"
  | "ORC.21.10"
  | "ORC.22"
  | "ORC.22.1"
  | "ORC.22.2"
  | "ORC.22.3"
  | "ORC.22.4"
  | "ORC.22.5"
  | "ORC.22.6"
  | "ORC.22.7"
  | "ORC.22.8"
  | "ORC.22.9"
  | "ORC.22.10"
  | "ORC.22.11"
  | "ORC.22.12"
  | "ORC.22.13"
  | "ORC.22.14"
  | "ORC.23"
  | "ORC.23.1"
  | "ORC.23.2"
  | "ORC.23.3"
  | "ORC.23.4"
  | "ORC.23.5"
  | "ORC.23.6"
  | "ORC.23.7"
  | "ORC.23.8"
  | "ORC.23.9"
  | "ORC.23.10"
  | "ORC.23.11"
  | "ORC.23.12"
  | "ORC.24"
  | "ORC.24.1"
  | "ORC.24.2"
  | "ORC.24.3"
  | "ORC.24.4"
  | "ORC.24.5"
  | "ORC.24.6"
  | "ORC.24.7"
  | "ORC.24.8"
  | "ORC.24.9"
  | "ORC.24.10"
  | "ORC.24.11"
  | "ORC.24.12"
  | "ORC.24.13"
  | "ORC.24.14"
  | "ORC.25"
  | "ORC.25.1"
  | "ORC.25.2"
  | "ORC.25.3"
  | "ORC.25.4"
  | "ORC.25.5"
  | "ORC.25.6"
  | "ORC.25.7"
  | "ORC.25.8"
  | "ORC.25.9"
  | "ORC.26"
  | "ORC.26.1"
  | "ORC.26.2"
  | "ORC.26.3"
  | "ORC.26.4"
  | "ORC.26.5"
  | "ORC.26.6"
  | "ORC.26.7"
  | "ORC.26.8"
  | "ORC.26.9"
  | "ORC.27"
  | "ORC.27.1"
  | "ORC.27.2"
  | "ORC.28"
  | "ORC.28.1"
  | "ORC.28.2"
  | "ORC.28.3"
  | "ORC.28.4"
  | "ORC.28.5"
  | "ORC.28.6"
  | "ORC.28.7"
  | "ORC.28.8"
  | "ORC.28.9"
  | "ORC.29"
  | "ORC.29.1"
  | "ORC.29.2"
  | "ORC.29.3"
  | "ORC.29.4"
  | "ORC.29.5"
  | "ORC.29.6"
  | "ORC.29.7"
  | "ORC.29.8"
  | "ORC.29.9"
  | "ORC.30"
  | "ORC.30.1"
  | "ORC.30.2"
  | "ORC.30.3"
  | "ORC.30.4"
  | "ORC.30.5"
  | "ORC.30.6"
  | "ORC.30.7"
  | "ORC.30.8"
  | "ORC.30.9"
  | "ORC.31"
  | "ORC.31.1"
  | "ORC.31.2"
  | "ORC.31.3"
  | "ORC.31.4"
  | "ORC.31.5"
  | "ORC.31.6"
  | "ORC.31.7"
  | "ORC.31.8"
  | "ORC.31.9"
  | "OBR.1"
  | "OBR.2"
  | "OBR.2.1"
  | "OBR.2.2"
  | "OBR.2.3"
  | "OBR.2.4"
  | "OBR.3"
  | "OBR.3.1"
  | "OBR.3.2"
  | "OBR.3.3"
  | "OBR.3.4"
  | "OBR.4"
  | "OBR.4.1"
  | "OBR.4.2"
  | "OBR.4.3"
  | "OBR.4.4"
  | "OBR.4.5"
  | "OBR.4.6"
  | "OBR.5"
  | "OBR.6"
  | "OBR.6.1"
  | "OBR.6.2"
  | "OBR.7"
  | "OBR.7.1"
  | "OBR.7.2"
  | "OBR.8"
  | "OBR.8.1"
  | "OBR.8.2"
  | "OBR.9"
  | "OBR.9.1"
  | "OBR.9.2"
  | "OBR.10"
  | "OBR.10.1"
  | "OBR.10.2"
  | "OBR.10.3"
  | "OBR.10.4"
  | "OBR.10.5"
  | "OBR.10.6"
  | "OBR.10.7"
  | "OBR.10.8"
  | "OBR.10.9"
  | "OBR.10.10"
  | "OBR.10.11"
  | "OBR.10.12"
  | "OBR.10.13"
  | "OBR.10.14"
  | "OBR.10.15"
  | "OBR.10.16"
  | "OBR.10.17"
  | "OBR.10.18"
  | "OBR.10.19"
  | "OBR.10.20"
  | "OBR.10.21"
  | "OBR.10.22"
  | "OBR.10.23"
  | "OBR.11"
  | "OBR.12"
  | "OBR.12.1"
  | "OBR.12.2"
  | "OBR.12.3"
  | "OBR.12.4"
  | "OBR.12.5"
  | "OBR.12.6"
  | "OBR.13"
  | "OBR.14"
  | "OBR.14.1"
  | "OBR.14.2"
  | "OBR.15"
  | "OBR.15.1"
  | "OBR.15.2"
  | "OBR.15.3"
  | "OBR.15.4"
  | "OBR.15.5"
  | "OBR.15.6"
  | "OBR.15.7"
  | "OBR.16"
  | "OBR.16.1"
  | "OBR.16.2"
  | "OBR.16.3"
  | "OBR.16.4"
  | "OBR.16.5"
  | "OBR.16.6"
  | "OBR.16.7"
  | "OBR.16.8"
  | "OBR.16.9"
  | "OBR.16.10"
  | "OBR.16.11"
  | "OBR.16.12"
  | "OBR.16.13"
  | "OBR.16.14"
  | "OBR.16.15"
  | "OBR.16.16"
  | "OBR.16.17"
  | "OBR.16.18"
  | "OBR.16.19"
  | "OBR.16.20"
  | "OBR.16.21"
  | "OBR.16.22"
  | "OBR.16.23"
  | "OBR.17"
  | "OBR.17.1"
  | "OBR.17.2"
  | "OBR.17.3"
  | "OBR.17.4"
  | "OBR.17.5"
  | "OBR.17.6"
  | "OBR.17.7"
  | "OBR.17.8"
  | "OBR.17.9"
  | "OBR.17.10"
  | "OBR.17.11"
  | "OBR.17.12"
  | "OBR.18"
  | "OBR.19"
  | "OBR.20"
  | "OBR.21"
  | "OBR.22"
  | "OBR.22.1"
  | "OBR.22.2"
  | "OBR.23"
  | "OBR.23.1"
  | "OBR.23.2"
  | "OBR.24"
  | "OBR.25"
  | "OBR.26"
  | "OBR.26.1"
  | "OBR.26.2"
  | "OBR.26.3"
  | "OBR.27"
  | "OBR.27.1"
  | "OBR.27.2"
  | "OBR.27.3"
  | "OBR.27.4"
  | "OBR.27.5"
  | "OBR.27.6"
  | "OBR.27.7"
  | "OBR.27.8"
  | "OBR.27.9"
  | "OBR.27.10"
  | "OBR.27.11"
  | "OBR.27.12"
  | "OBR.28"
  | "OBR.28.1"
  | "OBR.28.2"
  | "OBR.28.3"
  | "OBR.28.4"
  | "OBR.28.5"
  | "OBR.28.6"
  | "OBR.28.7"
  | "OBR.28.8"
  | "OBR.28.9"
  | "OBR.28.10"
  | "OBR.28.11"
  | "OBR.28.12"
  | "OBR.28.13"
  | "OBR.28.14"
  | "OBR.28.15"
  | "OBR.28.16"
  | "OBR.28.17"
  | "OBR.28.18"
  | "OBR.28.19"
  | "OBR.28.20"
  | "OBR.28.21"
  | "OBR.28.22"
  | "OBR.28.23"
  | "OBR.29"
  | "OBR.29.1"
  | "OBR.29.2"
  | "OBR.30"
  | "OBR.31"
  | "OBR.31.1"
  | "OBR.31.2"
  | "OBR.31.3"
  | "OBR.31.4"
  | "OBR.31.5"
  | "OBR.31.6"
  | "OBR.32"
  | "OBR.32.1"
  | "OBR.32.2"
  | "OBR.32.3"
  | "OBR.32.4"
  | "OBR.32.5"
  | "OBR.32.6"
  | "OBR.32.7"
  | "OBR.32.8"
  | "OBR.32.9"
  | "OBR.32.10"
  | "OBR.32.11"
  | "OBR.33"
  | "OBR.33.1"
  | "OBR.33.2"
  | "OBR.33.3"
  | "OBR.33.4"
  | "OBR.33.5"
  | "OBR.33.6"
  | "OBR.33.7"
  | "OBR.33.8"
  | "OBR.33.9"
  | "OBR.33.10"
  | "OBR.33.11"
  | "OBR.34"
  | "OBR.34.1"
  | "OBR.34.2"
  | "OBR.34.3"
  | "OBR.34.4"
  | "OBR.34.5"
  | "OBR.34.6"
  | "OBR.34.7"
  | "OBR.34.8"
  | "OBR.34.9"
  | "OBR.34.10"
  | "OBR.34.11"
  | "OBR.35"
  | "OBR.35.1"
  | "OBR.35.2"
  | "OBR.35.3"
  | "OBR.35.4"
  | "OBR.35.5"
  | "OBR.35.6"
  | "OBR.35.7"
  | "OBR.35.8"
  | "OBR.35.9"
  | "OBR.35.10"
  | "OBR.35.11"
  | "OBR.36"
  | "OBR.36.1"
  | "OBR.36.2"
  | "OBR.37"
  | "OBR.38"
  | "OBR.38.1"
  | "OBR.38.2"
  | "OBR.38.3"
  | "OBR.38.4"
  | "OBR.38.5"
  | "OBR.38.6"
  | "OBR.39"
  | "OBR.39.1"
  | "OBR.39.2"
  | "OBR.39.3"
  | "OBR.39.4"
  | "OBR.39.5"
  | "OBR.39.6"
  | "OBR.40"
  | "OBR.40.1"
  | "OBR.40.2"
  | "OBR.40.3"
  | "OBR.40.4"
  | "OBR.40.5"
  | "OBR.40.6"
  | "OBR.41"
  | "OBR.42"
  | "OBR.43"
  | "OBR.43.1"
  | "OBR.43.2"
  | "OBR.43.3"
  | "OBR.43.4"
  | "OBR.43.5"
  | "OBR.43.6"
  | "OBR.44"
  | "OBR.44.1"
  | "OBR.44.2"
  | "OBR.44.3"
  | "OBR.44.4"
  | "OBR.44.5"
  | "OBR.44.6"
  | "OBR.45"
  | "OBR.45.1"
  | "OBR.45.2"
  | "OBR.45.3"
  | "OBR.45.4"
  | "OBR.45.5"
  | "OBR.45.6"
  | "OBR.46"
  | "OBR.46.1"
  | "OBR.46.2"
  | "OBR.46.3"
  | "OBR.46.4"
  | "OBR.46.5"
  | "OBR.46.6"
  | "OBR.47"
  | "OBR.47.1"
  | "OBR.47.2"
  | "OBR.47.3"
  | "OBR.47.4"
  | "OBR.47.5"
  | "OBR.47.6"
  | "OBR.48"
  | "OBR.48.1"
  | "OBR.48.2"
  | "OBR.48.3"
  | "OBR.48.4"
  | "OBR.48.5"
  | "OBR.48.6"
  | "OBR.48.7"
  | "OBR.48.8"
  | "OBR.48.9"
  | "OBR.49"
  | "OBR.50"
  | "OBR.50.1"
  | "OBR.50.2"
  | "OBR.50.3"
  | "OBR.50.4"
  | "OBR.50.5"
  | "OBR.50.6"
  | "OBR.50.7"
  | "OBR.50.8"
  | "OBR.50.9"
  | "OBX.1"
  | "OBX.2"
  | "OBX.3"
  | "OBX.3.1"
  | "OBX.3.2"
  | "OBX.3.3"
  | "OBX.3.4"
  | "OBX.3.5"
  | "OBX.3.6"
  | "OBX.4"
  | "OBX.5"
  | "OBX.6"
  | "OBX.6.1"
  | "OBX.6.2"
  | "OBX.6.3"
  | "OBX.6.4"
  | "OBX.6.5"
  | "OBX.6.6"
  | "OBX.7"
  | "OBX.8"
  | "OBX.9"
  | "OBX.10"
  | "OBX.11"
  | "OBX.12"
  | "OBX.12.1"
  | "OBX.12.2"
  | "OBX.13"
  | "OBX.14"
  | "OBX.14.1"
  | "OBX.14.2"
  | "OBX.15"
  | "OBX.15.1"
  | "OBX.15.2"
  | "OBX.15.3"
  | "OBX.15.4"
  | "OBX.15.5"
  | "OBX.15.6"
  | "OBX.16"
  | "OBX.16.1"
  | "OBX.16.2"
  | "OBX.16.3"
  | "OBX.16.4"
  | "OBX.16.5"
  | "OBX.16.6"
  | "OBX.16.7"
  | "OBX.16.8"
  | "OBX.16.9"
  | "OBX.16.10"
  | "OBX.16.11"
  | "OBX.16.12"
  | "OBX.16.13"
  | "OBX.16.14"
  | "OBX.16.15"
  | "OBX.16.16"
  | "OBX.16.17"
  | "OBX.16.18"
  | "OBX.16.19"
  | "OBX.16.20"
  | "OBX.16.21"
  | "OBX.16.22"
  | "OBX.16.23"
  | "OBX.17"
  | "OBX.17.1"
  | "OBX.17.2"
  | "OBX.17.3"
  | "OBX.17.4"
  | "OBX.17.5"
  | "OBX.17.6"
  | "OBX.18"
  | "OBX.18.1"
  | "OBX.18.2"
  | "OBX.18.3"
  | "OBX.18.4"
  | "OBX.19"
  | "OBX.19.1"
  | "OBX.19.2"
  | "OBX.20"
  | "OBX.21"
  | "OBX.22"
  | "OBX.23"
  | "OBX.23.1"
  | "OBX.23.2"
  | "OBX.23.3"
  | "OBX.23.4"
  | "OBX.23.5"
  | "OBX.23.6"
  | "OBX.23.7"
  | "OBX.23.8"
  | "OBX.23.9"
  | "OBX.23.10"
  | "OBX.24"
  | "OBX.24.1"
  | "OBX.24.2"
  | "OBX.24.3"
  | "OBX.24.4"
  | "OBX.24.5"
  | "OBX.24.6"
  | "OBX.24.7"
  | "OBX.24.8"
  | "OBX.24.9"
  | "OBX.24.10"
  | "OBX.24.11"
  | "OBX.24.12"
  | "OBX.24.13"
  | "OBX.24.14"
  | "OBX.25"
  | "OBX.25.1"
  | "OBX.25.2"
  | "OBX.25.3"
  | "OBX.25.4"
  | "OBX.25.5"
  | "OBX.25.6"
  | "OBX.25.7"
  | "OBX.25.8"
  | "OBX.25.9"
  | "OBX.25.10"
  | "OBX.25.11"
  | "OBX.25.12"
  | "OBX.25.13"
  | "OBX.25.14"
  | "OBX.25.15"
  | "OBX.25.16"
  | "OBX.25.17"
  | "OBX.25.18"
  | "OBX.25.19"
  | "OBX.25.20"
  | "OBX.25.21"
  | "OBX.25.22"
  | "OBX.25.23"
  | "NTE.1"
  | "NTE.2"
  | "NTE.3"
  | "NTE.4"
  | "NTE.4.1"
  | "NTE.4.2"
  | "NTE.4.3"
  | "NTE.4.4"
  | "NTE.4.5"
  | "NTE.4.6";
//#endregion
//#region src/hl7v2/path-type.d.ts
/**
 * A path in HL7 notation: `PID.5`, `PID.5.1`, `PID.3[2].1`, `OBX[3].5`. See `get` for what a path selects.
 *
 * As a plain type, `Hl7Path` is `string`: any string is accepted at runtime, and one that is not a valid path matches
 * nothing (`parsePath` explains why). With a type argument, it checks the shape of a string literal and rejects
 * obvious mistakes while you type:
 *
 * - the segment is three upper-case letters or digits, optionally followed by an index such as `[2]`,
 * - a field number follows the segment, and component and subcomponent numbers may follow it,
 * - every number is a positive whole number without leading zeros, and only the segment and the field take an index.
 *
 * The check is shallow on purpose: it does not know which segments and fields exist, so `PID.99` and `ZPI.3` pass,
 * and it costs a few type instantiations per literal. Strings that are not literals (variables, template strings)
 * always pass. Where `get`, `getAll` and `isNull` take a path, the editor also offers every `KnownPath` while
 * you type, so the fields of the defined segments complete without limiting the paths that are accepted.
 *
 * @typeParam P - The path to check; inferred from the argument by `get`, `getAll` and `isNull`. A malformed literal
 * becomes a string type that carries the reason in its `invalidHl7Path` property, so the compiler's message names it.
 *
 * @example
 * ```ts
 * import { get, parse, type Hl7Path } from "hl7-to-fhir/hl7v2";
 *
 * const name: Hl7Path = "PID.5.1";
 * const checked: Hl7Path<"OBX[3].5"> = "OBX[3].5";
 * // const broken: Hl7Path<"PID..5"> = "PID..5"; // error: ... "a field is a positive number"
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||||Everyman^Adam");
 * if (result.ok) {
 *   get(result.value.message, name); // => "Everyman"
 *   get(result.value.message, "ZPI.3"); // => undefined
 * }
 * ```
 */
type Hl7Path<P extends string = string> = string extends P ? string : Invalid<P> extends (infer Reason extends string) ? [Reason] extends [""] ? P : string & {
  readonly invalidHl7Path: Reason;
} : never;
/** What is wrong with a path literal: the empty string when nothing is. */
type Invalid<P extends string> = P extends `${infer SegmentText}.${infer Remainder}` ? InvalidSegment<SegmentText> extends "" ? InvalidField<Remainder> : InvalidSegment<SegmentText> : "a field number must follow the segment, as in PID.5";
type InvalidSegment<S extends string> = S extends `${infer IdText}[${infer IndexText}]` ? InvalidId<IdText> extends "" ? InvalidIndex<IndexText> : InvalidId<IdText> : InvalidId<S>;
/** An identifier has three characters and no lower-case letters. */
type InvalidId<Id extends string> = string extends Id ? "" : Id extends `${string}${string}${string}${infer Remainder}` ? Remainder extends "" ? Id extends Uppercase<Id> ? "" : "the segment identifier must be upper case" : "the segment identifier has three characters" : "the segment identifier has three characters";
type InvalidField<R extends string> = R extends `${infer FieldText}.${infer Remainder}` ? InvalidNumbered<FieldText, "field"> extends "" ? InvalidComponent<Remainder> : InvalidNumbered<FieldText, "field"> : InvalidNumbered<R, "field">;
type InvalidComponent<R extends string> = R extends `${infer ComponentText}.${infer SubcomponentText}` ? InvalidNumber<ComponentText, "component"> extends "" ? InvalidNumber<SubcomponentText, "subcomponent"> : InvalidNumber<ComponentText, "component"> : InvalidNumber<R, "component">;
/** A number with an optional repetition index in brackets. */
type InvalidNumbered<N extends string, What extends string> = N extends `${infer NumberText}[${infer IndexText}]` ? InvalidNumber<NumberText, What> extends "" ? InvalidIndex<IndexText> : InvalidNumber<NumberText, What> : InvalidNumber<N, What>;
type InvalidIndex<Index extends string> = InvalidNumber<Index, "repetition index">;
/** A positive whole number: digits only, not starting with zero. */
type InvalidNumber<N extends string, What extends string> = string extends N ? "" : N extends `0${string}` ? `a ${What} is a positive number without leading zeros` : OnlyDigits<N> extends true ? "" : `a ${What} is a positive number`;
type OnlyDigits<N extends string> = N extends `${infer Digit}${infer Remainder}` ? Digit extends "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ? Remainder extends "" ? true : OnlyDigits<Remainder> : false : false;
//#endregion
//#region src/hl7v2/access.d.ts
/**
 * Reads the text at a path, or `undefined` when there is none.
 *
 * Paths use HL7 notation, so `PID.5.1` is component 1 of field 5 of the `PID` segment, the same position as
 * `segment.fields[5 - 1]`. `MSH.1` is the field separator and `MSH.2` the encoding characters. The rules:
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
 * @param path - The path, such as `PID.5.1`. Editors suggest the {@link KnownPath} values; any other well-formed
 * path is accepted too.
 * @returns The text, or `undefined`.
 *
 * @example
 * ```ts
 * import { get, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||12345^^^HOSP^MR||Everyman^Adam");
 * if (result.ok) {
 *   get(result.value.message, "PID.5.1"); // => "Everyman"
 *   get(result.value.message, "MSH.9.2"); // => "A01"
 *   // A well-formed path outside the defined segments is accepted and reads what it names.
 *   get(result.value.message, "ZPI.3"); // => undefined
 * }
 * ```
 */
export declare function get<P extends string>(message: Hl7Message, path: Hl7Path<P> | KnownPath): string | undefined;
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
 * @param path - The path, such as `PID.3.1`. Editors suggest the {@link KnownPath} values; any other well-formed
 * path is accepted too.
 * @returns The texts in message order; empty when the path selects nothing.
 *
 * @example
 * ```ts
 * import { getAll, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||111^^^HOSP^MR~222^^^HOSP^PI");
 * if (result.ok) {
 *   getAll(result.value.message, "PID.3.1"); // => ["111", "222"]
 *   getAll(result.value.message, "ZPI.3"); // => []
 * }
 * ```
 */
export declare function getAll<P extends string>(message: Hl7Message, path: Hl7Path<P> | KnownPath): readonly string[];
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
 * @param path - The path, such as `PID.8`. Editors suggest the {@link KnownPath} values; any other well-formed
 * path is accepted too.
 * @returns Whether the position holds the explicit null and nothing else.
 *
 * @example
 * ```ts
 * import { isNull, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse('MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\rPID|1||||""^Adam||""|');
 * if (result.ok) {
 *   isNull(result.value.message, "PID.7"); // => true
 *   // PID.8 is empty, not null, and only the first component of PID.5 is null.
 *   isNull(result.value.message, "PID.8"); // => false
 *   isNull(result.value.message, "PID.5"); // => false
 *   isNull(result.value.message, "PID.5.1"); // => true
 *   isNull(result.value.message, "ZPI.3"); // => false
 * }
 * ```
 */
export declare function isNull<P extends string>(message: Hl7Message, path: Hl7Path<P> | KnownPath): boolean;
//#endregion
//#region src/hl7v2/batch.d.ts
/**
 * The messages found in a batch file or stream, and what was dropped or doubtful on the way.
 *
 * @example
 * ```ts
 * import { splitBatch } from "hl7-to-fhir/hl7v2";
 *
 * declare const input: string;
 *
 * const { messages, issues } = splitBatch(input);
 * console.log(messages.length, issues.length);
 * ```
 */
interface BatchSplit {
  /** The messages in input order. Each starts with `MSH` and keeps its own segment terminators. */
  readonly messages: readonly string[];
  /** The issues in input order, located in the string passed to {@link splitBatch}. */
  readonly issues: readonly Issue[];
}
/**
 * Splits text that holds several HL7 v2 messages into single messages.
 *
 * The input may be a batch file (`FHS`, `BHS`, messages, `BTS`, `FTS`), a stream of MLLP frames (`0x0B` message
 * `0x1C` `0x0D`), plain concatenated messages, or a mixture. A message starts at an `MSH` segment and ends before
 * the next `MSH`, the next envelope segment, the MLLP end block or the end of the input. Segments end with `\r`, `\n`
 * or `\r\n`, with the rule of `parse`: the terminator of each MSH segment decides, and in a message whose MSH ends
 * with `\r` or `\r\n`, a line feed on its own is data, so a line after it belongs to the segment before, even when it
 * starts with `MSH` or an envelope identifier. The final terminator of a message is kept, so each message can be
 * passed to `parse` as it is. Blank lines between messages are ignored.
 *
 * Unlike `parse`, this function cannot fail and never throws: it returns what it found, possibly no message. An input
 * that is not a string, such as an undecoded `Buffer` passed from plain JavaScript, yields no messages and one
 * `INVALID_INPUT` error issue. Everything else it removes or doubts is reported in `issues`, as `parse` does:
 *
 * - info: the byte order mark and MLLP framing that were removed;
 * - warning: an MLLP frame without end block, malformed MLLP framing (an end block without start block or without
 *   the carriage return after it, text between frames, several messages in one frame), text that belongs to no
 *   message and is dropped, an `FHS` or `BHS` inside an envelope of its kind that has no trailer yet, and a `BTS-1`
 *   or `FTS-1` count that differs from the number of messages or batches.
 *
 * Envelope segments are dropped without an issue, because removing them is the purpose of the function. Batches are
 * counted as HL7 v2.5.1 section 2.10.3 defines a file, `[FHS] { [BHS] { [MSH ...] } [BTS] } [FTS]`: messages without
 * `BHS` form a batch too. Offsets in the issues refer to `input`, not to the returned messages, which are independent
 * strings; the position of a message in the result tells which message a later `parse` issue belongs to.
 *
 * The scan is a single pass over the characters, so the time is linear in the size of the input.
 *
 * @param input - The text of a batch file or stream.
 * @returns The messages and the issues found while splitting.
 *
 * @example
 * ```ts
 * import { parse, splitBatch } from "hl7-to-fhir/hl7v2";
 *
 * const input = [
 *   "FHS|^~\\&|LAB",
 *   "BHS|^~\\&|LAB",
 *   "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1",
 *   "PID|1||12345||Everyman^Adam",
 *   "MSH|^~\\&|LAB|HOSP|||20240115103100||ADT^A01|MSG00002|P|2.5.1",
 *   "PID|1||67890||Everywoman^Eve",
 *   "BTS|2",
 *   "FTS|1",
 * ].join("\r");
 *
 * const { messages } = splitBatch(input);
 * console.log(messages.length); // => 2
 * for (const message of messages) {
 *   const result = parse(message);
 *   if (result.ok) console.log(result.value.message.segments.length); // => 2
 * }
 * ```
 */
export declare function splitBatch(input: string): BatchSplit;
//#endregion
//#region src/hl7v2/definitions/types.d.ts
/**
 * Whether a sender must populate an element. `validate` reports a missing element only when it is required, and a
 * populated one only when it is not used.
 *
 * - `R`: required.
 * - `O`: optional.
 * - `C`: conditional; the condition depends on other elements and is not modelled here.
 * - `B`: kept only for backward compatibility with older versions.
 * - `X`: not used with this trigger event, or not supported; a field marked `X` that holds something is reported as
 *   `UNEXPECTED_FIELD`. The reserved positions of 2.5.1, such as OBX-20 to OBX-22, are marked `X`.
 *
 * @example
 * ```ts
 * import type { Optionality } from "hl7-to-fhir/hl7v2";
 *
 * const optionality: Optionality = "R";
 * ```
 */
type Optionality = "R" | "O" | "C" | "B" | "X";
/**
 * One field of a segment, as `defineSegment` returns it.
 *
 * @example
 * ```ts
 * import type { FieldDefinition } from "hl7-to-fhir/hl7v2";
 *
 * // PID-3, the patient identifier list
 * const pid3: FieldDefinition = {
 *   position: 3,
 *   name: "patientIdentifierList",
 *   dataType: "CX",
 *   optionality: "R",
 *   maxRepetitions: "unbounded",
 * };
 * ```
 */
interface FieldDefinition {
  /** The 1-based field number, as in HL7 notation (`PID-3` has position 3). */
  readonly position: number;
  /** A short identifier-style name, unique within the segment (for example `patientName`). */
  readonly name: string;
  /** The identifier of the field's data type (for example `XPN`); see `FieldDefinitionInput.dataType`. */
  readonly dataType: string;
  /** Whether the field is required. */
  readonly optionality: Optionality;
  /** How often the field may repeat: a count, or `"unbounded"` when there is no limit. */
  readonly maxRepetitions: number | "unbounded";
  /** The number of the HL7 table that lists the field's codes (for example `0001`), when there is one. */
  readonly table?: string | undefined;
}
/**
 * A segment: its identifier and its fields in order. Make one with `defineSegment` and pass it to `validate` or
 * `group` in `options.segments`.
 *
 * @example
 * ```ts
 * import { defineSegment, type SegmentDefinition } from "hl7-to-fhir/hl7v2";
 *
 * const zpi: SegmentDefinition = defineSegment({ id: "ZPI", fields: [{ name: "setId", dataType: "SI" }] });
 * ```
 */
interface SegmentDefinition {
  /** The three-character segment identifier, such as `PID`. */
  readonly id: string;
  /** The fields, ordered by position and numbered contiguously from 1. */
  readonly fields: readonly FieldDefinition[];
}
//#endregion
//#region src/hl7v2/define-segment.d.ts
/**
 * One field of a {@link SegmentDefinitionInput}. Its number is its position in the list: the first field is field 1.
 *
 * @example
 * ```ts
 * import type { FieldDefinitionInput } from "hl7-to-fhir/hl7v2";
 *
 * const visitCount: FieldDefinitionInput = { name: "visitCount", dataType: "NM", optionality: "R" };
 * ```
 */
interface FieldDefinitionInput {
  /** A short identifier-style name, such as `favouriteColour`. */
  readonly name: string;
  /**
   * The data type, such as `ST`, `NM`, `DTM`, `TS`, `CE` or `XPN`: one of the types of the library's segment
   * definitions or `TM`. The formats of `NM`, `SI`, `DT`, `DTM`, `TM`, `ID` and `IS` are checked, and the components
   * of composite types. For a type the library does not know, use `ST`, which is not checked.
   */
  readonly dataType: string;
  /** Whether the field is required (`R`); `O`, optional, when left out. */
  readonly optionality?: Optionality | undefined;
  /** How often the field may repeat: a whole number of at least 1 or `"unbounded"`; 1 when left out. */
  readonly maxRepetitions?: number | "unbounded" | undefined;
  /**
   * The number of the HL7 table its codes come from: four digits, such as `0001`. Only the tables the library ships
   * are checked: 0001, 0003, 0004, 0076, 0085, 0104, 0123, 0203 and 0354.
   */
  readonly table?: string | undefined;
}
/**
 * What {@link defineSegment} takes: a segment identifier and its fields in order.
 *
 * @example
 * ```ts
 * import type { SegmentDefinitionInput } from "hl7-to-fhir/hl7v2";
 *
 * const zpi: SegmentDefinitionInput = { id: "ZPI", fields: [{ name: "setId", dataType: "SI" }] };
 * ```
 */
interface SegmentDefinitionInput {
  /** The segment identifier, such as `ZPI`: three upper-case letters or digits, starting with a letter. */
  readonly id: string;
  /** The fields in order: the first is field 1. */
  readonly fields: readonly FieldDefinitionInput[];
}
/**
 * Defines a segment, typically a locally defined Z segment, so that `validate` checks it: pass the result in
 * `validate(message, { segments: [...] })`.
 *
 * Fields are numbered by their position in the list and default to optional and not repeating. A segment with a
 * definition is allowed anywhere in a message whose structure does not contain it, so a defined Z segment is never
 * reported for its position. A definition with the identifier of a built-in segment replaces the built-in one. The
 * definitions passed in apply to every message version, while the built-in ones apply to version 2.5 and 2.5.x only.
 *
 * A malformed definition is a mistake in the calling code, not in a message, so it throws instead of returning a
 * `Result`, as the library does only for programming errors: a `TypeError` for a missing property or one of the wrong type, and a `RangeError` for an
 * identifier that is not three upper-case letters or digits starting with a letter, an empty name, a data type the
 * library does not know, an optionality other than `R`, `O`, `C`, `B` and `X`, repetitions that are not a whole
 * number of at least 1 or `"unbounded"`, or a table number that is not four digits. The message names the property.
 *
 * @param definition - The identifier and the fields.
 * @returns The definition with every field numbered and its defaults filled in.
 * @throws `TypeError` or `RangeError` when the definition is malformed.
 *
 * @example
 * ```ts
 * import { defineSegment, parse, validate } from "hl7-to-fhir/hl7v2";
 *
 * const zpi = defineSegment({
 *   id: "ZPI",
 *   fields: [
 *     { name: "setId", dataType: "SI" },
 *     { name: "favouriteColour", dataType: "ST", optionality: "R" },
 *     { name: "lastVisit", dataType: "DT" },
 *   ],
 * });
 * zpi.fields[2]; // => { position: 3, name: "lastVisit", dataType: "DT", optionality: "O", maxRepetitions: 1 }
 *
 * const result = parse(
 *   "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.5.1\rEVN||20240115\rPID|1||1||Everyman\rPV1|1|I\rZPI|1||2024-01-15",
 * );
 * if (result.ok) {
 *   validate(result.value.message, { segments: [zpi] }).map(({ code }) => code);
 *   // => ["REQUIRED_FIELD_MISSING", "INVALID_DATE"]
 * }
 * ```
 */
export declare function defineSegment(definition: SegmentDefinitionInput): SegmentDefinition;
//#endregion
//#region src/hl7v2/definition-options.d.ts
/**
 * The options of `validate` and `group`: definitions of segments the library does not define.
 *
 * @example
 * ```ts
 * import { defineSegment, type DefinitionOptions } from "hl7-to-fhir/hl7v2";
 *
 * const options: DefinitionOptions = {
 *   segments: [defineSegment({ id: "ZPI", fields: [{ name: "setId", dataType: "SI" }] })],
 * };
 * ```
 */
interface DefinitionOptions {
  /**
   * Definitions of segments the library does not define, typically Z segments, made with `defineSegment`. A segment
   * with a definition is allowed wherever the message structure does not contain it, its fields are checked against
   * the definition in every message version, and a definition with the identifier of a built-in segment replaces it.
   * Of several definitions with one identifier, the last counts. A definition that was not made with `defineSegment`
   * and does not have its shape is ignored and reported as `INVALID_DEFINITION`.
   */
  readonly segments?: readonly SegmentDefinition[] | undefined;
}
//#endregion
//#region src/hl7v2/group.d.ts
/**
 * A segment in a {@link SegmentGroup}: its position in `message.segments`.
 *
 * @example
 * ```ts
 * import type { Hl7Message, SegmentReference } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 * declare const reference: SegmentReference;
 *
 * const segment = message.segments[reference.segmentIndex];
 * ```
 */
interface SegmentReference {
  /** Discriminant: a segment, not a group. */
  readonly kind: "segment";
  /** The 0-based index of the segment in `message.segments`. */
  readonly segmentIndex: number;
}
/**
 * One occurrence of a segment group of the message structure, such as one `ORDER_OBSERVATION` of an ORU^R01.
 *
 * @example
 * ```ts
 * import type { SegmentGroup } from "hl7-to-fhir/hl7v2";
 *
 * declare const order: SegmentGroup;
 *
 * const observations = order.children.filter(
 *   (child) => child.kind === "group" && child.name === "OBSERVATION",
 * );
 * ```
 */
interface SegmentGroup {
  /** Discriminant: a group, not a segment. */
  readonly kind: "group";
  /** The name of the group in the message structure, such as `ORDER_OBSERVATION`. */
  readonly name: string;
  /** The segments and nested groups of this occurrence, in message order. */
  readonly children: readonly GroupChild[];
}
/**
 * A segment or a nested group in a {@link SegmentGroup} or at the top level of {@link MessageGroups}.
 *
 * @example
 * ```ts
 * import type { GroupChild } from "hl7-to-fhir/hl7v2";
 *
 * function segmentIndexes(children: readonly GroupChild[]): number[] {
 *   return children.flatMap((child) =>
 *     child.kind === "segment" ? [child.segmentIndex] : segmentIndexes(child.children),
 *   );
 * }
 * ```
 */
type GroupChild = SegmentReference | SegmentGroup;
/**
 * The segments of a message arranged in the groups of its message structure.
 *
 * Every segment of the message appears exactly once, in message order, so the tree never drops a segment: one the
 * structure does not allow at its position (a Z segment, an unknown or misplaced one) is placed in the group that was
 * open when it occurred and, in a message of version 2.5 or 2.5.x, reported in `issues`. When the structure is
 * unknown or the library has no definition of it, every segment is a child of the top level.
 *
 * @example
 * ```ts
 * import type { MessageGroups } from "hl7-to-fhir/hl7v2";
 *
 * declare const groups: MessageGroups;
 *
 * if (groups.structure === "ORU_R01") console.log(groups.children.length);
 * ```
 */
interface MessageGroups {
  /**
   * The message structure, such as `ORU_R01`: MSH-9.3, or the structure MSH-9.1 and MSH-9.2 imply (`ACK` for an
   * acknowledgment, otherwise the one HL7 table 0354 assigns to the message code and trigger event). Absent when
   * MSH-9 identifies none.
   */
  readonly structure?: string | undefined;
  /** The top-level segments and groups, in message order. */
  readonly children: readonly GroupChild[];
  /** The issues of the structure and of what does not match it, in message order. */
  readonly issues: readonly Issue[];
}
/**
 * Arranges the segments of a message in the segment groups of its message structure, such as the
 * `ORDER_OBSERVATION` and `OBSERVATION` groups of an ORU^R01, so that code mapping a message can walk orders and their
 * observations instead of a flat list of segments.
 *
 * The structure is the one MSH-9.3 names or, without MSH-9.3, the one MSH-9.1 and MSH-9.2 imply: `ACK` for an
 * acknowledgment, otherwise the one HL7 table 0354 assigns to the message code and trigger event (`ADT^A04` is
 * `ADT_A01`). The library knows the 2.5.1 structures ADT_A01 and ORU_R01; for other structures every segment is a
 * child of the top level.
 *
 * Every segment appears exactly once, in message order, referred to by its index in `message.segments`. A segment
 * that cannot continue the structure (a Z segment, an unknown, misplaced or repeated one) stays in the group that was
 * open when it occurred and is reported in `issues`, as are required segments that are missing; `validate` reports
 * the same issues. Segments the structure does not contain are allowed anywhere when the options define them. A
 * segment that is valid in several places belongs to the first one that the segments before it leave open, so an NTE
 * after an OBX belongs to its `OBSERVATION`. A segment is never reported as missing when it is present elsewhere.
 *
 * For a message whose MSH-12 is not 2.5 or 2.5.x, the tree is still the best grouping the 2.5.1 structure gives, but
 * what does not fit it is not reported, as segments were added and moved between versions.
 *
 * It takes time linear in the number of segments and never throws: a tree that does not have the shape of a message,
 * possible only from plain JavaScript, has no children and one `INVALID_TREE` issue, and a definition in `options`
 * that was not made with `defineSegment` and does not have its shape is ignored and reported as
 * `INVALID_DEFINITION`.
 *
 * @param message - A message from `parse`.
 * @param options - Definitions of further segments, such as Z segments made with `defineSegment`.
 * @returns The structure, the tree of groups and segments, and the issues.
 *
 * @example
 * ```ts
 * import { group, parse, type GroupChild } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse(
 *   "MSH|^~\\&|LAB|HOSP|||20240116091500||ORU^R01|MSG00002|P|2.5.1\rPID|1||12345||Everyman^Adam\rOBR|1|||24331-1^Lipid panel^LN\rOBX|1|NM|2093-3^Cholesterol^LN||196\rNTE|1||Fasting\rOBX|2|NM|2571-8^Triglyceride^LN||110",
 * );
 * if (result.ok) {
 *   const { message } = result.value;
 *   const groups = group(message);
 *   groups.structure; // => "ORU_R01"
 *
 *   const outline = (children: readonly GroupChild[]): unknown[] =>
 *     children.map((child) =>
 *       child.kind === "segment" ? message.segments[child.segmentIndex]?.id : { [child.name]: outline(child.children) },
 *     );
 *   outline(groups.children);
 *   // => ["MSH", { PATIENT_RESULT: [{ PATIENT: ["PID"] }, { ORDER_OBSERVATION: ["OBR", { OBSERVATION: ["OBX", "NTE"] }, { OBSERVATION: ["OBX"] }] }] }]
 * }
 * ```
 */
export declare function group(message: Hl7Message, options?: DefinitionOptions): MessageGroups;
//#endregion
//#region src/hl7v2/parse.d.ts
/**
 * What {@link parse} returns when it succeeds, the counterpart of {@link ParseFailure}: the message and everything the
 * parser tolerated or could not interpret.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * declare const input: string;
 *
 * const result = parse(input);
 * if (result.ok) {
 *   const { message, issues } = result.value;
 *   console.log(message.segments.length, issues.length);
 * }
 * ```
 */
interface ParseSuccess {
  /** The message tree. */
  readonly message: Hl7Message;
  /** The issues in input order; parsing succeeded regardless of their severity. */
  readonly issues: readonly Issue[];
}
/**
 * Why the input could not be read as an HL7 v2 message at all.
 *
 * - `INVALID_INPUT`: the input is not a string (for example an undecoded `Buffer`).
 * - `EMPTY_INPUT`: there is no text once framing and whitespace are removed.
 * - `MISSING_MSH`: the first segment is not `MSH`.
 * - `INVALID_FIELD_SEPARATOR`: MSH-1 is missing or not a printable ASCII punctuation character.
 * - `INVALID_ENCODING_CHARACTERS`: MSH-2 has fewer than two or more than five characters, or the delimiters are not
 *   distinct punctuation characters.
 */
type ParseFailureCode =
  | "INVALID_INPUT"
  | "EMPTY_INPUT"
  | "MISSING_MSH"
  | "INVALID_FIELD_SEPARATOR"
  | "INVALID_ENCODING_CHARACTERS";
/**
 * The reason {@link parse} failed, with the issues found up to that point.
 *
 * `issues` always ends with an `error` issue whose `code` equals the failure `code` and whose location points at the
 * offending input, so editors can underline it.
 *
 * @example
 * ```ts
 * import { parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("PID|1");
 * if (!result.ok) console.error(result.error.code); // => "MISSING_MSH"
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
 * Parsing is lenient: segments may end with `\r`, `\n` or `\r\n` (when MSH ends with `\r` or `\r\n`, a
 * line feed on its own is data and stays in its value); a byte order mark, MLLP framing and whitespace after the last
 * segment are removed; unknown, Z and malformed segments are kept in order. Each deviation is reported in
 * `issues`. Parsing fails only when the input is not a string, has no `MSH` segment first or
 * declares unusable delimiters; it never throws.
 *
 * Every node carries a span into `input`, the string passed in, even when framing was removed. Read values with
 * `get` and `getAll` in HL7 notation (`PID.5.1`), or walk the tree, where `fields[n - 1]` is field `n`.
 * The types of the issues are exported from the main entry point, `hl7-to-fhir`.
 *
 * A later MSH segment starts a second message; `parse` keeps it as a segment and reports it (`UNEXPECTED_MSH`, or the
 * error `UNEXPECTED_MSH_DELIMITERS` when it declares other delimiters than the first).
 *
 * Memory: the returned tree keeps one object per field, repetition, component and subcomponent, each with its own
 * span. That is about 110 bytes per object and, for segment-heavy messages, roughly 160 times the size of the input
 * (a 1 MB message with 17,000 OBX segments retains about 159 MB; plain text retains about 1 times its size). The
 * worst case is a segment of one-character fields (`PID|` followed by `a|` 500,000 times), which retains about 450
 * times the size of the input: 1 MB of input can retain 450 MB. The library sets no size limit, so limit the size of
 * untrusted input before calling `parse`, sized from that factor (256 KB is about 115 MB), and parse the messages of
 * a batch one at a time. See SECURITY.md.
 *
 * @param input - One message as text. Use `splitBatch` for batch files or streams with several messages.
 * @returns The message and its issues, or why it could not be parsed.
 *
 * @example
 * ```ts
 * import type { Issue } from "hl7-to-fhir";
 * import { get, parse } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam");
 * if (result.ok) {
 *   console.log(get(result.value.message, "PID.5.1")); // => "Everyman"
 *   const notable: Issue[] = result.value.issues.filter((issue) => issue.severity !== "info");
 *   for (const { code, message } of notable) console.warn(code, message);
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export declare function parse(input: string): Result<ParseSuccess, ParseFailure>;
//#endregion
//#region src/hl7v2/path.d.ts
/**
 * A path split into its parts. Numbering follows the rule of `Location`: a name ending in `Index` is a 0-based array
 * index, every other position is the 1-based number of HL7 notation. A path names positions only, so all numbers here
 * are 1-based (`PID.5.1` has `field: 5` and `component: 1`; `OBX[3]` is the third `OBX` segment), and {@link get}
 * reads `fields[field - 1]`.
 *
 * Parts the path leaves out are `undefined`: no `segmentOccurrence` selects the first segment with the identifier
 * (`get`) or all of them (`getAll`), no `repetition` the first repetition (`get`) or all (`getAll`), and no
 * `component` or `subcomponent` the first one.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("OBX[3].5.1");
 * if (result.ok) console.log(result.value);
 * // => { segmentId: "OBX", segmentOccurrence: 3, field: 5, repetition: undefined, component: 1, subcomponent: undefined }
 * ```
 */
interface ParsedPath {
  /** The segment identifier, such as `PID`. */
  readonly segmentId: string;
  /** Which segment of that identifier, counted over the whole message from 1: `3` in `OBX[3]`. */
  readonly segmentOccurrence?: number | undefined;
  /** The field number: `5` in `PID.5`. */
  readonly field: number;
  /** Which repetition of the field, counted from 1: `2` in `PID.3[2]`. */
  readonly repetition?: number | undefined;
  /** The component number: `1` in `PID.5.1`. */
  readonly component?: number | undefined;
  /** The subcomponent number: `2` in `PID.5.1.2`. */
  readonly subcomponent?: number | undefined;
}
/**
 * Why a path could not be read.
 *
 * - `INVALID_INPUT`: the path is not a string.
 * - `EMPTY_PATH`: the path is the empty string.
 * - `INVALID_SEGMENT_ID`: the segment is not three upper-case letters or digits starting with a letter.
 * - `MISSING_FIELD`: there is no field number after the segment, as in `PID`.
 * - `INVALID_NUMBER`: a field, component or subcomponent number is not a positive whole number without leading
 *   zeros, or a component or subcomponent carries a repetition index.
 * - `INVALID_INDEX`: a bracketed repetition index is not a positive whole number, or its brackets are malformed.
 * - `TOO_MANY_PARTS`: the path has more than four parts (segment, field, component, subcomponent).
 */
type PathFailureCode =
  | "INVALID_INPUT"
  | "EMPTY_PATH"
  | "INVALID_SEGMENT_ID"
  | "MISSING_FIELD"
  | "INVALID_NUMBER"
  | "INVALID_INDEX"
  | "TOO_MANY_PARTS";
/**
 * The reason {@link parsePath} rejected a path.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.x");
 * if (!result.ok) console.error(result.error.code, result.error.span); // => "INVALID_NUMBER", { start: 4, end: 5 }
 * ```
 */
interface PathFailure {
  /** Discriminant: what is wrong with the path. */
  readonly code: PathFailureCode;
  /** A description of what is wrong with the path; it never repeats the path. */
  readonly message: string;
  /** The offending part of the path, as offsets into the string passed to `parsePath`. */
  readonly span: Span;
}
/**
 * Parses a path such as `PID.5.1`, `PID.3[2].1` or `OBX[3].5` into its parts.
 *
 * The grammar is `SEG[.F[.C[.S]]]` with an optional 1-based repetition index in brackets after the segment and after
 * the field: `SEG[n].F[r].C.S`. A path must name at least a field. `get`, `getAll` and `isNull` use this function and
 * treat a path that fails here as matching nothing; call it to find out why.
 *
 * @param path - The path to parse.
 * @returns The parts of the path, or why it was rejected.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.3[2].1");
 * if (result.ok) console.log(result.value.field, result.value.repetition); // => 3, 2
 * ```
 */
export declare function parsePath(path: string): Result<ParsedPath, PathFailure>;
//#endregion
//#region src/hl7v2/stringify-failure.d.ts
/**
 * Why `stringify` cannot write a tree. Trees returned by `parse` are written, except in two cases of malformed input
 * described under `DELIMITERS_MISMATCH` and `HEX_ESCAPE_UNSUPPORTED`; the failures concern trees built or changed by
 * hand.
 *
 * The tree as a whole:
 *
 * - `INVALID_TREE`: the tree does not have the shape of `Hl7Message`: a node is missing, `null`, not an object
 *   or of an unknown `kind`, a list is not an array or has holes, a value or identifier is not a string, or
 *   `truncated` is neither `true` nor absent. Plain JavaScript callers can pass anything; the tree is checked first.
 * - `INVALID_DELIMITERS`: `message.delimiters` cannot be declared in MSH-1 and MSH-2: a delimiter is not a single
 *   printable ASCII character that is neither a letter nor a digit, two are equal, or one is declared although a
 *   delimiter before it in MSH-2 (escape before subcomponent before truncation) is omitted.
 * - `MISSING_MSH`: the message has no segments, or the first one is not `MSH`.
 * - `INVALID_SEGMENT_ID`: a segment identifier contains the field separator or a carriage return, so it would not
 *   read back as one identifier. Other identifiers that `isValidSegmentId` rejects, as `parse` keeps them, are
 *   written as they are.
 *
 * The header (`message.delimiters` is the single source of truth for the delimiters; MSH-1 and MSH-2 are written
 * from it):
 *
 * - `DELIMITERS_MISMATCH`: MSH-1 or MSH-2 holds something other than the declared delimiters, or the written MSH
 *   segment would declare others, for example a truncation character that the version in MSH-12 does not allow.
 *   A tree from `parse` meets it only when the raw MSH-12 starts with an escape sequence (`\H\2.7`) that hides from
 *   the truncation rule a version the written text shows, in a message whose MSH-2 has a fifth character.
 * - `VERSION_MISMATCH`: `message.version` differs from the value of MSH-12.1, from which `parse` reads it.
 *
 * Values the delimiters or the character set cannot express:
 *
 * - `ESCAPE_CHARACTER_REQUIRED`: a value contains a delimiter or a carriage return, or is the text `""`, which need
 *   an escape sequence, but MSH-2 declares no escape character. A line feed is written as it is, except in the first
 *   MSH segment, where it would end the segment.
 * - `HEX_ESCAPE_UNSUPPORTED`: a value contains a carriage return or is the text `""`, which need a hexadecimal escape
 *   sequence, but MSH-18 names a character set in which the library cannot write one: `UNICODE`, `UNICODE UTF-16`,
 *   `UNICODE UTF-32` or a name HL7 table 0211 does not define. Line feeds are written as `\.br\` there, which fails
 *   too when "." is a delimiter, because it would split the sequence. A tree from
 *   `parse` meets it only for a value `""` that the input wrote with formatting commands, such as `"\H\"`, in such a
 *   character set.
 * - `SUBCOMPONENT_SEPARATOR_REQUIRED`: a component has more than one subcomponent, but MSH-2 declares no subcomponent
 *   separator.
 * - `NULL_NOT_REPRESENTABLE`: a subcomponent is the HL7 null, but the quote character is one of the delimiters, so
 *   `""` would not read back as the null.
 * - `TRUNCATION_CHARACTER_REQUIRED`: a value is marked as truncated, but MSH-2 declares no truncation character.
 *
 * The output:
 *
 * - `OUTPUT_TOO_LARGE`: the text would be longer than the longest string the JavaScript engine can hold.
 */
type StringifyFailureCode =
  | "INVALID_TREE"
  | "INVALID_DELIMITERS"
  | "MISSING_MSH"
  | "INVALID_SEGMENT_ID"
  | "DELIMITERS_MISMATCH"
  | "VERSION_MISMATCH"
  | "ESCAPE_CHARACTER_REQUIRED"
  | "HEX_ESCAPE_UNSUPPORTED"
  | "SUBCOMPONENT_SEPARATOR_REQUIRED"
  | "NULL_NOT_REPRESENTABLE"
  | "TRUNCATION_CHARACTER_REQUIRED"
  | "OUTPUT_TOO_LARGE";
/**
 * The reason `stringify` could not write a message, and the node it is about.
 *
 * @example
 * ```ts
 * import { stringify, type Hl7Message } from "hl7-to-fhir/hl7v2";
 *
 * declare const message: Hl7Message;
 *
 * const result = stringify(message);
 * if (!result.ok) console.error(result.error.code, result.error.location.field);
 * ```
 */
interface StringifyFailure {
  /** Discriminant: why the tree cannot be written. */
  readonly code: StringifyFailureCode;
  /** A description without message content. */
  readonly message: string;
  /**
   * The node: its position in HL7 numbers (`segmentIndex`, `field`, ...) and the span the tree gives it, or an empty
   * span at 0 when the tree gives none. A failure about the message as a whole has only the span.
   */
  readonly location: Location;
}
//#endregion
//#region src/hl7v2/stringify.d.ts
/**
 * Writes a message as HL7 v2 text: the inverse of `parse`.
 *
 * `parse(stringify(message))` yields the same tree, apart from its spans, which describe the new text, and from
 * empty nodes, which are written the way `parse` represents them:
 *
 * - Empty children at the end of a list are not written, as `parse` trims them. A value `""` that is not truncated
 *   (left by removed formatting commands) is written as nothing, so it reads back as an empty subcomponent, and a
 *   node whose children are all empty reads back without children.
 * - MSH-1 and MSH-2 are written from `message.delimiters`, the single source of truth; a tree without them gets
 *   them, one with others fails (`DELIMITERS_MISMATCH`).
 *
 * The output is canonical: every segment, the last one included, ends with a carriage return, and values are
 * escaped with the message delimiters. Line feeds are written as `\X0A\` (as `\.br\` in a character set without
 * hexadecimal escapes, and as they are, where they read back as data, in a message without escape character).
 * Segment identifiers are written as they are. A segment that would otherwise read back as a blank line or with an
 * MLLP end block at its end gets a trailing field separator, which reads back as nothing, and one whose identifier
 * starts with a line feed follows `\r\n` instead of `\r`, so the line feed does not join the terminator before it.
 *
 * Three things do not survive a round trip from text, because the tree no longer holds them: formatting commands that
 * `parse` removed from a value, the original spelling of escape sequences (`\X41\` is written as `A`), and the
 * terminators and framing of the input.
 *
 * Writing never throws. It fails instead of producing text that reads back differently (see
 * {@link StringifyFailureCode}): for a tree that does not have the shape of a message, and for one that holds what
 * its delimiters or character set cannot express, for example a value with a `|` in a message whose MSH-2 omits the
 * escape character. Trees returned by `parse` are written, except in two cases of malformed input described under
 * `DELIMITERS_MISMATCH` and `HEX_ESCAPE_UNSUPPORTED`.
 *
 * @param message - The message to write, usually from `parse`.
 * @returns The message text, or why it cannot be written.
 *
 * @example
 * ```ts
 * import { parse, stringify } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\nPID|1||12345||Everyman^Adam\n");
 * if (result.ok) {
 *   const text = stringify(result.value.message);
 *   if (text.ok) console.log(text.value);
 *   // => "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam\r"
 * }
 * ```
 */
export declare function stringify(message: Hl7Message): Result<string, StringifyFailure>;
//#endregion
//#region src/hl7v2/validate.d.ts
/**
 * Checks a message against HL7 v2.5.1 and returns everything that deviates from it: the issues `group` reports about
 * the message structure and the order of the segments, and the issues of the fields and values of every segment the
 * library or `options` defines (required fields, repetitions, components, the formats of numbers, dates, times and
 * codes, and codes of the shipped HL7 tables), together in message order.
 *
 * Parsing is lenient and validation strict: `parse` accepts what it can read, `validate` reports everything that
 * deviates from the standard, so callers decide what to block. Every issue has a stable code, an exact location and,
 * for a value, the value in `value`; the message never contains message content, but `value` may, so do not log it
 * unless your logs may hold patient data.
 *
 * - The built-in definitions are those of version 2.5.1. For a message whose MSH-12 is not 2.5 or 2.5.x, the segments
 *   are neither checked for their order nor against the built-in definitions, only against the definitions in
 *   `options`, and an `UNSUPPORTED_VERSION` note says so.
 * - Z segments and segments the structure does not contain are never dropped; they are reported unless `options`
 *   defines them.
 * - The rules and their codes are listed in the table of validation rules, linked from the section "Validation rules"
 *   of the README: https://github.com/Soeren04/kindling-hl7-fhir#validation-rules.
 *
 * It takes time linear in the size of the message and never throws: a tree that does not have the shape of a
 * message, possible only from plain JavaScript, yields one `INVALID_TREE` issue, and a definition in `options` that was
 * not made with `defineSegment` and does not have its shape is ignored and reported as `INVALID_DEFINITION`.
 *
 * @param message - A message from `parse`.
 * @param options - Definitions of further segments, such as Z segments made with `defineSegment`.
 * @returns The first 10,000 issues in message order, followed by `TOO_MANY_ISSUES` when there are more; empty for a
 *   valid message.
 *
 * @example
 * ```ts
 * import { parse, validate } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse(
 *   "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|MSG00001|P|2.5.1\rEVN||20240115103000\rPID|1||12345||Everyman^Adam||19800231|Q",
 * );
 * if (result.ok) {
 *   const issues = validate(result.value.message);
 *   issues.map(({ severity, code, location }) => `${severity} ${code} ${location.segmentId ?? ""}`);
 *   // => ["error INVALID_DATE_TIME PID", "warning UNKNOWN_USER_DEFINED_CODE PID", "error SEGMENT_MISSING PV1"]
 *   issues[0]?.value; // => "19800231"
 * }
 * ```
 */
export declare function validate(message: Hl7Message, options?: DefinitionOptions): readonly Issue[];
//#endregion
export type { BatchSplit, Component, DefinitionOptions, Delimiters, EmptySubcomponent, Field, FieldDefinition, FieldDefinitionInput, GroupChild, Hl7Message, Hl7Path, KnownPath, MessageGroups, NullSubcomponent, Optionality, ParseFailure, ParseFailureCode, ParseSuccess, ParsedPath, PathFailure, PathFailureCode, Repetition, Segment, SegmentDefinition, SegmentDefinitionInput, SegmentGroup, SegmentReference, StringifyFailure, StringifyFailureCode, Subcomponent, ValueSubcomponent };