// A consumer of the published package whose tsconfig sets `"types": []`, so no global type package is loaded. The
// Consumer job of CI compiles this file against the packed tarball; consumer.test.ts compiles it against the sources.
// It must keep compiling: the FHIR types of the public API come from the `fhir/r4` module of @types/fhir, a
// dependency of the package, never from the `fhir4` global namespace, which `"types": []` hides.
import type { Bundle, Identifier, Patient } from "fhir/r4";
import {
  type Conversion,
  convert,
  type ConvertFailure,
  type Issue,
  type MappedResource,
  type Result,
} from "hl7-to-fhir";
import { parse } from "hl7-to-fhir/hl7v2";

const parsed = parse("MSH|^~\\&|LAB|HOSP");

export const issues: readonly Issue[] = parsed.ok
  ? parsed.value.issues
  : parsed.error.issues;

const converted: Result<Conversion, ConvertFailure> = convert(
  "MSH|^~\\&|ADT|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345",
  { customize: { Patient: (patient: Patient): Patient => patient } },
);

// A Bundle of the resources a conversion creates, which narrows by resourceType.
export const bundle: Bundle<MappedResource> | undefined = converted.ok
  ? converted.value.bundle
  : undefined;

const first = bundle?.entry?.[0]?.resource;

export const identifier: Identifier | undefined =
  first?.resourceType === "Patient" ? first.identifier?.[0] : undefined;

export type BundleResult = Result<Bundle, Issue>;
