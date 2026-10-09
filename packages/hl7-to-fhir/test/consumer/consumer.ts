// A consumer of the published package whose tsconfig sets `"types": []`, so no global type package is loaded. The
// Consumer job of CI compiles this file against the packed tarball; consumer.test.ts compiles it against the sources.
// It must keep compiling: the FHIR types of the public API come from the `fhir/r4` module of @types/fhir, a
// dependency of the package, never from the `fhir4` global namespace, which `"types": []` hides.
import type { Bundle, Identifier } from "fhir/r4";
import type { Issue, Result } from "hl7-to-fhir";
import { parse } from "hl7-to-fhir/hl7v2";

const parsed = parse("MSH|^~\\&|LAB|HOSP");

export const issues: readonly Issue[] = parsed.ok
  ? parsed.value.issues
  : parsed.error.issues;

export const bundle: Bundle = {
  resourceType: "Bundle",
  type: "collection",
};

export const identifier: Identifier = { value: "12345" };

export type BundleResult = Result<Bundle, Issue>;
