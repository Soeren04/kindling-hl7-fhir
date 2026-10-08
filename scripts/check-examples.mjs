// @ts-check
// Fails when an exported function of the public API has no `@example` in its TSDoc (ADR 0007). It reads the bundled
// declarations, so it checks exactly what users see. Usage: `node check-examples.mjs <directory with .d.ts files>`.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * Lists the exported functions of a declaration file that have no `@example` tag.
 *
 * A function counts as documented when any of its overloads has the tag. Functions are exported either with an
 * `export` modifier or, as in bundled declarations, through an `export { … }` list.
 *
 * @param {string} fileName - The file name, for messages and parsing.
 * @param {string} text - The declaration file content.
 * @returns {string[]} The public names of the functions without an example, in source order.
 */
export function findFunctionsWithoutExample(fileName, text) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.ES2022,
    true,
  );
  const exportedAs = exportedNames(source);
  /** @type {Map<string, boolean>} */
  const documented = new Map();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined)
      continue;
    const local = statement.name.text;
    const hasExample = ts
      .getJSDocTags(statement)
      .some((tag) => tag.tagName.text === "example");
    documented.set(local, (documented.get(local) ?? false) || hasExample);
  }
  return [...documented]
    .filter(([local, hasExample]) => exportedAs.has(local) && !hasExample)
    .map(([local]) => exportedAs.get(local) ?? local);
}

/**
 * Maps the local name of every exported declaration to its public name.
 *
 * @param {ts.SourceFile} source
 * @returns {Map<string, string>}
 */
function exportedNames(source) {
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined
    ) {
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        names.set(
          (element.propertyName ?? element.name).text,
          element.name.text,
        );
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export
    ) {
      names.set(statement.name.text, statement.name.text);
    }
  }
  return names;
}

// Exercised by running the script in `pnpm check:api`; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const directory = process.argv[2] ?? ".";
  const files = readdirSync(directory).filter((name) => name.endsWith(".d.ts"));
  const missing = files.flatMap((name) =>
    findFunctionsWithoutExample(
      name,
      readFileSync(path.join(directory, name), "utf8"),
    ).map((exported) => `${name}: ${exported} has no @example in its TSDoc`),
  );
  for (const problem of missing) console.error(`Examples: ${problem}`);
  if (files.length === 0)
    console.error(`Examples: no .d.ts files in ${directory}`);
  process.exitCode = missing.length === 0 && files.length > 0 ? 0 : 1;
}
/* v8 ignore stop */
