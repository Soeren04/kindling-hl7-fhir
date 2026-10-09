// The package is compiled with exactOptionalPropertyTypes, and so may be its users' code. Every optional property of
// the public types is declared `?: T | undefined`, so values of type `T | undefined`, as optional chaining and
// conditional expressions produce them, can be assigned without a cast.
import { describe, expectTypeOf, it } from "vitest";

import type { Delimiters, Hl7Message } from "../../src/hl7v2/model";
import type { ParsedPath } from "../../src/hl7v2/path";
import type { Issue, Location } from "../../src/shared/issue";

declare const maybeNumber: number | undefined;
declare const maybeString: string | undefined;

describe("optional properties", () => {
  it("accept undefined explicitly", () => {
    const location: Location = {
      span: { start: 0, end: 0 },
      segmentIndex: maybeNumber,
      segmentId: maybeString,
      field: maybeNumber,
      repetition: maybeNumber,
      component: maybeNumber,
      subcomponent: maybeNumber,
    };
    const issue: Issue = {
      code: "UNKNOWN_ESCAPE",
      severity: "warning",
      message: "",
      location,
      value: maybeString,
    };
    const delimiters: Delimiters = {
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
      truncation: maybeString,
    };
    const message: Hl7Message = {
      delimiters,
      version: maybeString,
      segments: [],
    };
    const path: ParsedPath = {
      segmentId: "OBX",
      segmentOccurrence: maybeNumber,
      field: 5,
      repetition: maybeNumber,
      component: maybeNumber,
      subcomponent: maybeNumber,
    };
    expectTypeOf([location, issue, message, path]).toBeArray();
  });
});
