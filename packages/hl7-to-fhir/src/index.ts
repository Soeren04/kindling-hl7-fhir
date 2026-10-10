/**
 * Convert HL7 v2 messages to FHIR R4.
 *
 * @packageDocumentation
 */

export {
  type Conversion,
  convert,
  type Converter,
  type ConvertFailure,
  type ConvertFailureCode,
  createConverter,
} from "./fhir/convert";
export { type IdGenerator, sequentialIds } from "./fhir/ids";
export type {
  BundleType,
  ConvertOptions,
  Customizer,
  Customizers,
  HookContext,
  MappedResource,
  MappedResources,
  MappedResourceType,
  SegmentMapper,
  SegmentMapperContext,
} from "./fhir/options";
export type {
  Issue,
  IssueCode,
  Location,
  Severity,
  Span,
} from "./shared/issue";
export type { Err, Ok, Result } from "./shared/result";
