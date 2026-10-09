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
 * The check is shallow on purpose: it does not know which segments and fields exist, so `PID.99` passes, and it
 * costs a few type instantiations per literal. Strings that are not literals (variables, template strings) always
 * pass.
 *
 * @typeParam P - The path to check; inferred from the argument by `get`, `getAll` and `isNull`.
 *
 * @example
 * ```ts
 * import type { Hl7Path } from "hl7-to-fhir/hl7v2";
 *
 * const name: Hl7Path = "PID.5.1";
 * const checked: Hl7Path<"OBX[3].5"> = "OBX[3].5";
 * // const broken: Hl7Path<"PID..5"> = "PID..5"; // error: Invalid HL7 path: ...
 * ```
 */
type Hl7Path<P extends string = string> = string extends P ? string : Invalid<P> extends (infer Reason extends string) ? [Reason] extends [""] ? P : `Invalid HL7 path: ${Reason}` : never;
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
export declare function get<P extends string>(message: Hl7Message, path: Hl7Path<P>): string | undefined;
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
export declare function getAll<P extends string>(message: Hl7Message, path: Hl7Path<P>): readonly string[];
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
export declare function isNull<P extends string>(message: Hl7Message, path: Hl7Path<P>): boolean;
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
 * console.log(messages.length); // 2
 * for (const message of messages) {
 *   const result = parse(message);
 *   if (result.ok) console.log(result.value.message.segments.length); // 2
 * }
 * ```
 */
export declare function splitBatch(input: string): BatchSplit;
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
type ParseFailureCode = "INVALID_INPUT" | "EMPTY_INPUT" | "MISSING_MSH" | "INVALID_FIELD_SEPARATOR" | "INVALID_ENCODING_CHARACTERS";
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
 * library sets no size limit, so check the size of untrusted input before calling `parse`, and parse the messages of
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
 *   console.log(get(result.value.message, "PID.5.1")); // "Everyman"
 *   const problems: Issue[] = result.value.issues.filter((issue) => issue.severity !== "info");
 *   for (const { code, message } of problems) console.warn(code, message);
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export declare function parse(input: string): Result<ParseSuccess, ParseFailure>;
//#endregion
//#region src/hl7v2/path.d.ts
/**
 * A path split into its parts. Numbers are 1-based, as written in HL7 notation (`PID.5.1` has `field: 5` and
 * `component: 1`); {@link get} reads `fields[field - 1]`.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("OBX[3].5.1");
 * // { segment: "OBX", segmentIndex: 3, field: 5, fieldIndex: undefined, component: 1, subcomponent: undefined }
 * ```
 */
interface ParsedPath {
  /** The segment identifier, such as `PID`. */
  readonly segment: string;
  /** Which segment of that identifier, counted over the whole message; `undefined` selects the first (`get`) or all (`getAll`). */
  readonly segmentIndex: number | undefined;
  /** The field number: `5` in `PID.5`. */
  readonly field: number;
  /** Which repetition of the field; `undefined` selects the first (`get`) or all (`getAll`). */
  readonly fieldIndex: number | undefined;
  /** The component number; `undefined` selects the first component. */
  readonly component: number | undefined;
  /** The subcomponent number; `undefined` selects the first subcomponent. */
  readonly subcomponent: number | undefined;
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
type PathFailureCode = "INVALID_INPUT" | "EMPTY_PATH" | "INVALID_SEGMENT_ID" | "MISSING_FIELD" | "INVALID_NUMBER" | "INVALID_INDEX" | "TOO_MANY_PARTS";
/**
 * The reason {@link parsePath} rejected a path.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.x");
 * if (!result.ok) console.error(result.error.code, result.error.span); // "INVALID_NUMBER", { start: 4, end: 5 }
 * ```
 */
interface PathFailure {
  /** Discriminant: what is wrong with the path. */
  readonly code: PathFailureCode;
  /** A description of the problem. */
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
 * @returns The parts of the path, or the first problem found.
 *
 * @example
 * ```ts
 * import { parsePath } from "hl7-to-fhir/hl7v2";
 *
 * const result = parsePath("PID.3[2].1");
 * if (result.ok) console.log(result.value.field, result.value.fieldIndex); // 3 2
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
type StringifyFailureCode = "INVALID_TREE" | "INVALID_DELIMITERS" | "MISSING_MSH" | "INVALID_SEGMENT_ID" | "DELIMITERS_MISMATCH" | "VERSION_MISMATCH" | "ESCAPE_CHARACTER_REQUIRED" | "HEX_ESCAPE_UNSUPPORTED" | "SUBCOMPONENT_SEPARATOR_REQUIRED" | "NULL_NOT_REPRESENTABLE" | "TRUNCATION_CHARACTER_REQUIRED" | "OUTPUT_TOO_LARGE";
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
 *   // "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam\r"
 * }
 * ```
 */
export declare function stringify(message: Hl7Message): Result<string, StringifyFailure>;
//#endregion
export type { BatchSplit, Component, Delimiters, EmptySubcomponent, Field, Hl7Message, Hl7Path, NullSubcomponent, ParseFailure, ParseFailureCode, ParseSuccess, ParsedPath, PathFailure, PathFailureCode, Repetition, Segment, StringifyFailure, StringifyFailureCode, Subcomponent, ValueSubcomponent };