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
//#region src/hl7v2/batch.d.ts
/**
 * The messages found in a batch file or stream, and what was dropped or doubtful on the way.
 *
 * @example
 * ```ts
 * const { messages, issues } = splitBatch(input);
 * console.log(messages.length, issues.length);
 * ```
 */
interface BatchSplit {
  /** The messages in input order. Each starts with `MSH` and keeps its own segment terminators. */
  readonly messages: readonly string[];
  /** Remarks in input order, located in the string passed to {@link splitBatch}. */
  readonly issues: readonly Issue[];
}
/**
 * Splits text that holds several HL7 v2 messages into single messages.
 *
 * The input may be a batch file (`FHS`, `BHS`, messages, `BTS`, `FTS`), a stream of MLLP frames (`0x0B` message
 * `0x1C` `0x0D`), plain concatenated messages, or a mixture. A message starts at an `MSH` segment and ends before
 * the next `MSH`, the next envelope segment, the MLLP end block or the end of the input. Segments end with `\r`, `\n`
 * or `\r\n`; the final terminator of a message is kept, so each message can be passed to `parse` as it is. Blank
 * lines between messages are ignored.
 *
 * Unlike `parse`, this function cannot fail: it returns what it found, possibly no message. Everything it removes or
 * doubts is reported in `issues`, as `parse` does (ADR 0003): the byte order mark and MLLP framing (info), an MLLP
 * frame without end block, text that belongs to no message and is dropped, and a `BTS-1` or `FTS-1` count that
 * differs from the number of messages or batches (warnings). Envelope segments are dropped without a remark,
 * because removing them is the purpose of the function. Offsets in the issues refer to `input`, not to the returned
 * messages, which are independent strings; the position of a message in the result tells which message a later
 * `parse` issue belongs to.
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
//#region src/hl7v2/path.d.ts
/**
 * A path split into its parts. Numbers are 1-based, as written in HL7 notation (`PID.5.1` has `field: 5` and
 * `component: 1`); {@link get} applies the `n - 1` that ADR 0008 prescribes for the arrays.
 *
 * @example
 * ```ts
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
 * - `EMPTY_PATH`: the path is the empty string.
 * - `INVALID_SEGMENT_ID`: the segment is not three upper-case letters or digits starting with a letter.
 * - `MISSING_FIELD`: there is no field number after the segment, as in `PID`.
 * - `INVALID_NUMBER`: a field, component or subcomponent number is not a positive whole number without leading
 *   zeros, or a component or subcomponent carries a repetition index.
 * - `INVALID_INDEX`: a bracketed repetition index is not a positive whole number, or its brackets are malformed.
 * - `TOO_MANY_PARTS`: the path has more than four parts (segment, field, component, subcomponent).
 */
type PathErrorCode = "EMPTY_PATH" | "INVALID_SEGMENT_ID" | "MISSING_FIELD" | "INVALID_NUMBER" | "INVALID_INDEX" | "TOO_MANY_PARTS";
/**
 * The reason {@link parsePath} rejected a path.
 *
 * @example
 * ```ts
 * const result = parsePath("PID.x");
 * if (!result.ok) console.error(result.error.code, result.error.span); // "INVALID_NUMBER", { start: 4, end: 5 }
 * ```
 */
interface PathError {
  /** Discriminant: what is wrong with the path. */
  readonly code: PathErrorCode;
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
export declare function parsePath(path: string): Result<ParsedPath, PathError>;
//#endregion
//#region src/hl7v2/stringify.d.ts
/**
 * Writes a message as HL7 v2 text: the inverse of `parse`.
 *
 * The output is canonical. Every segment, the last one included, ends with a carriage return. Values are escaped with
 * the message delimiters, so `parse(stringify(message))` yields the same tree except for its spans, which describe
 * the new text. Nodes are written as the tree holds them: parsed trees never end in empty nodes, so the output has no
 * trailing delimiters, but a tree built by hand with trailing empty nodes keeps them.
 *
 * Three things do not survive a round trip, because the tree no longer holds them: formatting commands that `parse`
 * removed from a value, the original spelling of escape sequences (`\X41\` is written as `A`), and the terminators
 * and framing of the input. A value that is empty because it consisted only of removed formatting commands is
 * written as an empty subcomponent.
 *
 * MSH-1 and MSH-2 are written as they stand in the first two fields of the MSH segment, never escaped. The HL7 null
 * is always written as two quote characters, so a tree with nulls needs a message whose delimiters do not include
 * the quote; `parse` never returns such a tree.
 *
 * @param message - The message to write, usually from `parse`.
 * @returns The message text, or an empty string for a message without segments.
 *
 * @example
 * ```ts
 * import { parse, stringify } from "hl7-to-fhir/hl7v2";
 *
 * const result = parse("MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\nPID|1||12345||Everyman^Adam\n");
 * if (result.ok) {
 *   stringify(result.value.message);
 *   // "MSH|^~\\&|LAB|HOSP|||20240115103000||ADT^A01|MSG00001|P|2.5.1\rPID|1||12345||Everyman^Adam\r"
 * }
 * ```
 */
export declare function stringify(message: Hl7Message): string;
//#endregion
export type { BatchSplit, Component, Delimiters, EmptySubcomponent, Field, Hl7Message, NullSubcomponent, ParseFailure, ParseFailureCode, ParsedMessage, ParsedPath, PathError, PathErrorCode, Repetition, Segment, Subcomponent, ValueSubcomponent };