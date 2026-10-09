// The table of rules and codes in docs/validation-rules.md is generated from the rule metadata of the library, so it
// cannot drift from the code. After changing a rule or an issue code, run `pnpm update:validation-rules` and review
// the diff.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validationRules } from "../packages/hl7-to-fhir/src/hl7v2/validate/catalog";
import {
  validationRulesFile,
  validationRulesSource,
} from "../scripts/validation-rules-source";

describe("the validation rules page", () => {
  it("lists every rule and code of the library", async () => {
    const committed = readFileSync(
      new URL(`../${validationRulesFile}`, import.meta.url),
      "utf8",
    );
    expect(committed).toBe(await validationRulesSource());
  });

  it("names each validation code in exactly one rule", () => {
    const codes = validationRules.flatMap((rule) => rule.codes);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
