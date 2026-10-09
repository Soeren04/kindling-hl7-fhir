/**
 * Parse HL7 v2 messages into a readonly tree with exact character spans, validate them against HL7 v2.5.1 and group
 * their segments by message structure.
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
export { get, getAll, isNull } from "./hl7v2/access";
export { type BatchSplit, splitBatch } from "./hl7v2/batch";
export {
  defineSegment,
  type FieldDefinitionInput,
  type SegmentDefinitionInput,
} from "./hl7v2/define-segment";
export type {
  FieldDefinition,
  Optionality,
  SegmentDefinition,
} from "./hl7v2/definitions/types";
export {
  group,
  type GroupChild,
  type MessageGroups,
  type SegmentGroup,
  type SegmentReference,
} from "./hl7v2/group";
export {
  parse,
  type ParseSuccess,
  type ParseFailure,
  type ParseFailureCode,
} from "./hl7v2/parse";
export {
  parsePath,
  type ParsedPath,
  type PathFailure,
  type PathFailureCode,
} from "./hl7v2/path";
export type { KnownPath } from "./hl7v2/known-paths";
export type { Hl7Path } from "./hl7v2/path-type";
export {
  stringify,
  type StringifyFailure,
  type StringifyFailureCode,
} from "./hl7v2/stringify";
export { validate } from "./hl7v2/validate";
export type { DefinitionOptions } from "./hl7v2/definition-options";
