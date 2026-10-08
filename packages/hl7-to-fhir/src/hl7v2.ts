/**
 * Parse HL7 v2 messages into a readonly tree with exact character spans.
 *
 * The types of the issues and results these functions return (`Issue`, `IssueCode`, `Location`, `Span`,
 * `Result`) are exported from the main entry point, `hl7-to-fhir`.
 *
 * @packageDocumentation
 */

export type {
  Component,
  Delimiters,
  EmptySubcomponent,
  Field,
  Hl7Message,
  NullSubcomponent,
  Repetition,
  Segment,
  Subcomponent,
  ValueSubcomponent,
} from "./hl7v2/model";
export { type BatchSplit, splitBatch } from "./hl7v2/batch";
export {
  parse,
  type ParsedMessage,
  type ParseFailure,
  type ParseFailureCode,
} from "./hl7v2/parse";
export { stringify } from "./hl7v2/stringify";
