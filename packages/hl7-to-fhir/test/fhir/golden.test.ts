// The FHIR output of every sample, checked against the golden files in test/golden/fhir/, which
// `pnpm update:fhir-goldens` rewrites; CI runs the official FHIR validator on the bundles among them.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Bundle } from "fhir/r4";
import { describe, expect, it } from "vitest";

import {
  fhirGoldenDirectory,
  fhirGoldens,
} from "../../../../scripts/fhir-goldens-source";
import { references } from "./references";

const root = path.resolve(import.meta.dirname, "../../../..");
const directory = path.join(root, fhirGoldenDirectory);
const expected = await fhirGoldens(root);

const bundles = [...expected]
  .filter(([name]) => name.endsWith(".bundle.json"))
  .map(([name, content]) => [name, JSON.parse(content) as Bundle] as const);

describe("the FHIR golden files", () => {
  it("match the conversions of the samples (`pnpm update:fhir-goldens` rewrites them)", () => {
    const committed = new Map(
      readdirSync(directory)
        .sort()
        .map((name) => [
          name,
          readFileSync(path.join(directory, name), "utf8"),
        ]),
    );
    expect(committed).toStrictEqual(new Map([...expected].sort()));
  });

  it("cover every sample", () => {
    const samples = readdirSync(path.join(root, "samples"))
      .filter((name) => name.endsWith(".hl7"))
      .map((name) => path.basename(name, ".hl7"));
    for (const sample of samples) {
      expect(
        [...expected.keys()].some((name) => name.startsWith(`${sample}.`)),
      ).toBe(true);
    }
  });

  describe.each(bundles)("%s", (_, bundle) => {
    const fullUrls = (bundle.entry ?? []).map(({ fullUrl }) => fullUrl);

    it("gives every entry a unique urn:uuid fullUrl", () => {
      for (const fullUrl of fullUrls) {
        expect(fullUrl).toMatch(
          /^urn:uuid:[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u,
        );
      }
      expect(new Set(fullUrls).size).toBe(fullUrls.length);
    });

    it("resolves every reference inside the bundle", () => {
      const unresolved = references(bundle).filter(
        (reference) => !fullUrls.includes(reference),
      );
      expect(unresolved).toStrictEqual([]);
    });
  });
});
