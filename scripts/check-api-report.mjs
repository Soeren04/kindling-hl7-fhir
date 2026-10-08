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

// Exercised by running the script in `pnpm check:api`; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const build = readDeclarations("dist");
  if (build.size === 0) {
    console.error(
      "API report: no declarations in dist/; run `pnpm build` first.",
    );
    process.exitCode = 1;
  } else if (process.argv.includes("--update")) {
    writeDeclarations("api", build);
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
