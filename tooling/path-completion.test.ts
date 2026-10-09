import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureFile = path.join(
  repositoryRoot,
  "tooling/path-completion.fixture.ts",
);
const hl7v2Entry = path.join(repositoryRoot, "packages/hl7-to-fhir/src/hl7v2");

/** The caret marker the fixtures use for the completion position; it is removed before the file is checked. */
const caret = "|";

/**
 * Runs the TypeScript language service, the engine behind editor completions and squiggles, on an in-memory file
 * that imports the library sources.
 */
function languageServiceFor(source: string): ts.LanguageService {
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ES2022,
      lib: ["lib.es2022.d.ts"],
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      types: [],
      noEmit: true,
    }),
    getScriptFileNames: () => [fixtureFile],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text =
        fileName === fixtureFile ? source : ts.sys.readFile(fileName);
      return text === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => repositoryRoot,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (fileName) =>
      fileName === fixtureFile || ts.sys.fileExists(fileName),
    readFile: (fileName) =>
      fileName === fixtureFile ? source : ts.sys.readFile(fileName),
    directoryExists: (directory) => ts.sys.directoryExists(directory),
    getDirectories: (directory) => ts.sys.getDirectories(directory),
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

/** A file that calls `get` with the given argument text, which may contain the caret. */
function callOf(argument: string): string {
  return `import { get, type Hl7Message } from "${hl7v2Entry}";

declare const message: Hl7Message;
get(message, ${argument});
`;
}

/** The names the editor offers at the caret of `argument`. */
function completionsAt(argument: string): readonly string[] {
  const source = callOf(argument);
  const position = source.indexOf(caret);
  const withoutCaret = source.replace(caret, "");
  const service = languageServiceFor(withoutCaret);
  const completions = service.getCompletionsAtPosition(
    fixtureFile,
    position,
    {},
  );
  service.dispose();
  return completions?.entries.map((entry) => entry.name) ?? [];
}

/** The messages of the errors the compiler reports for `argument`. */
function errorsFor(argument: string): readonly string[] {
  const service = languageServiceFor(callOf(argument));
  const messages = service
    .getSemanticDiagnostics(fixtureFile)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
  service.dispose();
  return messages;
}

describe("path completion in the editor", () => {
  it("offers every known path inside an empty string literal", () => {
    expect(completionsAt(`"${caret}"`)).toContain("PID.5.1");
  });

  it("offers the paths that continue what is typed", () => {
    expect(completionsAt(`"PID.${caret}"`)).toContain("PID.5");
  });

  it("reports no error for a known path and for another well-formed one", () => {
    expect(errorsFor('"PID.5.1"')).toStrictEqual([]);
    expect(errorsFor('"OBX[3].5"')).toStrictEqual([]);
  });

  it("names the reason in the error for a malformed literal", () => {
    const errors = errorsFor('"PID..5"');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("invalidHl7Path");
    expect(errors[0]).toContain("a field is a positive number");
  });
});
