// The public declarations will name FHIR types from `fhir/r4`. A consumer resolves them only if @types/fhir is
// installed with the package and the module form is used, which also works when the consumer's tsconfig sets
// `"types": []`. The Consumer job of CI proves it against the packed tarball; this test checks the same fixture
// against the sources, so a regression shows up before the build.
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const fixture = path.join(packageRoot, "test/consumer");

/** Creating a TypeScript program takes seconds, and longer under coverage on a busy machine. */
const programTimeout = 60_000;

/** The compiler options of the fixture, resolving the package entries to their sources. */
function fixtureOptions(): ts.CompilerOptions {
  const configFile = path.join(fixture, "tsconfig.json");
  const config: unknown = ts.readConfigFile(configFile, (file) =>
    ts.sys.readFile(file),
  ).config;
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, fixture);
  return {
    ...options,
    // The sources use extensionless relative imports, which only bundler resolution reads; the published files are
    // checked with the fixture's own nodenext resolution in CI.
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: {
      "hl7-to-fhir": [path.join(packageRoot, "src/index.ts")],
      "hl7-to-fhir/hl7v2": [path.join(packageRoot, "src/hl7v2.ts")],
    },
  };
}

describe("a consumer without global types", () => {
  it(
    "compiles against the FHIR types of the package's dependency",
    () => {
      const options = fixtureOptions();
      expect(options.types).toStrictEqual([]);
      const program = ts.createProgram(
        [path.join(fixture, "consumer.ts")],
        options,
      );
      const messages = ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      expect(messages).toStrictEqual([]);
    },
    programTimeout,
  );

  it("gets @types/fhir installed with the package, at one exact version", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@types/fhir"]).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(manifest.devDependencies).not.toHaveProperty("@types/fhir");
  });
});
