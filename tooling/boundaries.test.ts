import path from "node:path";

import { cruise, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

import configuration from "../.dependency-cruiser.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function cruiseFixtures(): Promise<ICruiseResult> {
  const { output } = await cruise(["tooling/fixtures/src"], {
    ...configuration.options,
    baseDir: repositoryRoot,
    validate: true,
    ruleSet: { forbidden: configuration.forbidden ?? [] },
  });
  if (typeof output === "string")
    throw new Error("Expected a structured cruise result");
  return output;
}

/** Shortens a path inside node_modules to its package name, so the expectations do not depend on versions. */
function packageName(target: string): string {
  return target.replace(/^.*node_modules\/((?:@[^/]+\/)?[^/]+)\/.*$/u, "$1");
}

describe("dependency-cruiser boundaries", () => {
  it("reports exactly the forbidden imports in the fixtures", async () => {
    const { summary } = await cruiseFixtures();
    const violations = summary.violations
      .map(
        ({ rule, from, to }) => `${rule.name}: ${from} -> ${packageName(to)}`,
      )
      .sort();

    expect(violations).toStrictEqual([
      "fhir-builds-on-hl7v2-only: tooling/fixtures/src/fhir/imports-cli.ts -> tooling/fixtures/src/cli/main.ts",
      "hl7v2-knows-no-fhir: tooling/fixtures/src/hl7v2/imports-fhir.ts -> tooling/fixtures/src/fhir/class-declaration.ts",
      "hl7v2-knows-no-fhir: tooling/fixtures/src/hl7v2/node-import.ts -> fs",
      "no-circular: tooling/fixtures/src/shared/cycle-a.ts -> tooling/fixtures/src/shared/cycle-b.ts",
      "no-dev-dependencies-in-library: tooling/fixtures/src/uses-dev-dependency.ts -> vitest",
      "no-unresolvable: tooling/fixtures/src/unresolvable-import.ts -> ./does-not-exist",
      "nothing-imports-the-cli: tooling/fixtures/src/fhir/imports-cli.ts -> tooling/fixtures/src/cli/main.ts",
      "only-cli-uses-node: tooling/fixtures/src/hl7v2/node-import.ts -> fs",
      "shared-is-self-contained: tooling/fixtures/src/shared/imports-hl7v2.ts -> tooling/fixtures/src/hl7v2/clean.ts",
    ]);
  });

  it("has a fixture for every rule", async () => {
    const { summary } = await cruiseFixtures();
    const fired = new Set(summary.violations.map(({ rule }) => rule.name));
    expect([...fired].sort()).toStrictEqual(
      (configuration.forbidden ?? []).map(({ name }) => name).sort(),
    );
  });
});
