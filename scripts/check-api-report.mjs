// @ts-check
// Fails when the bundled declarations in dist/ differ from the API report committed in api/ (ADR 0007), so every
// change to the public API shows up in review. Run from the package directory after the build; `--update` rewrites
// the report from the build instead.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/**
 * Lists every difference between the committed report and the build.
 *
 * @param {ReadonlyMap<string, string>} report - Committed declarations by file name.
 * @param {ReadonlyMap<string, string>} build - Built declarations by file name.
 * @returns {string[]} One human-readable problem per differing, missing or stale file; empty when they match.
 */
export function compareApiReport(report, build) {
  const problems = [];
  for (const [name, content] of build) {
    const committed = report.get(name);
    if (committed === undefined) problems.push(`${name} is not in the report`);
    else if (committed !== content)
      problems.push(`${name} differs from the report`);
  }
  for (const name of report.keys()) {
    if (!build.has(name)) problems.push(`${name} is no longer built`);
  }
  return problems;
}

// A top-level `type Name = "a" | "b" | ...;` on one line; the bundler writes the whole union on a single line.
const stringUnionAlias =
  /^((?:export |declare )?type \w+ = )("[^"\n]*"(?: \| "[^"\n]*")*);$/gm;
const longestLine = 120;

/**
 * Lays out long string-literal union aliases one member per line, so a change to the union shows up as the members
 * that were added or removed instead of one rewritten line of many thousand characters. Everything else is kept as is.
 *
 * @param {string} declaration - The text of a declaration file.
 * @returns {string} The text with every long top-level string-literal union reflowed.
 */
export function normalizeDeclaration(declaration) {
  return declaration.replace(
    stringUnionAlias,
    (
      /** @type {string} */ alias,
      /** @type {string} */ head,
      /** @type {string} */ union,
    ) =>
      alias.length <= longestLine
        ? alias
        : `${head.trimEnd()}\n${union
            .split(" | ")
            .map((member) => `  | ${member}`)
            .join("\n")};`,
  );
}

/**
 * Reads the declaration files of a directory.
 *
 * @param {string} directory - The directory to read; a missing directory has no files.
 * @returns {Map<string, string>} File contents by file name.
 */
export function readDeclarations(directory) {
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return new Map();
  }
  return new Map(
    names
      // The ESM declarations make up the report; the CommonJS copies (.d.cts) differ only in import extensions.
      .filter((name) => name.endsWith(".d.ts"))
      .sort()
      .map((name) => [name, readFileSync(path.join(directory, name), "utf8")]),
  );
}

/**
 * Makes `directory` hold exactly the given declaration files.
 *
 * @param {string} directory - The report directory; created when missing.
 * @param {ReadonlyMap<string, string>} declarations - File contents by file name.
 */
export function writeDeclarations(directory, declarations) {
  mkdirSync(directory, { recursive: true });
  for (const name of readDeclarations(directory).keys()) {
    if (!declarations.has(name)) rmSync(path.join(directory, name));
  }
  for (const [name, content] of declarations) {
    writeFileSync(path.join(directory, name), content);
  }
}

// Exercised by spawning the script in the tests and by `pnpm check:api`; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const build = new Map(
    [...readDeclarations("dist")].map(([name, content]) => [
      name,
      normalizeDeclaration(content),
    ]),
  );
  if (build.size === 0) {
    console.error(
      "API report: no declarations in dist/; run `pnpm build` first.",
    );
    process.exitCode = 1;
  } else if (process.argv.includes("--update")) {
    const changes = compareApiReport(readDeclarations("api"), build);
    writeDeclarations("api", build);
    console.log(
      changes.length === 0
        ? "API report: api/ is already up to date."
        : `API report: updated api/ (${changes.join("; ")}).`,
    );
  } else {
    const problems = compareApiReport(readDeclarations("api"), build);
    for (const problem of problems) console.error(`API report: ${problem}`);
    if (problems.length > 0) {
      console.error(
        "If the API change is intended, run `pnpm update:api` and commit packages/hl7-to-fhir/api/.",
      );
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
  }
}
/* v8 ignore stop */
