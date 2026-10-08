// @ts-check
// Fails unless the npm tarball of the current package contains exactly the build output plus the package metadata
// and legal files. Run from the package directory after the build.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Files every published tarball must contain, besides the ones the `exports` map points to. */
const requiredFiles = ["package.json", "README.md", "LICENSE", "NOTICE"];

/** Build output: ESM and CJS bundles with their declarations, directly in dist/. */
const buildOutput = /^dist\/[\w.-]+\.(?:js|cjs|d\.ts|d\.cts)$/;

/**
 * Lists everything wrong with the given tarball contents.
 *
 * @param {readonly string[]} files - Paths inside the tarball, relative to the package root.
 * @param {readonly string[]} exportTargets - Paths the `exports` map points to, relative to the package root.
 * @returns {string[]} One human-readable problem per missing or unexpected file; empty when the contents are fine.
 */
export function findPackageContentProblems(files, exportTargets) {
  const required = new Set([...requiredFiles, ...exportTargets]);
  const missing = [...required]
    .filter((file) => !files.includes(file))
    .map((file) => `missing ${file}`);
  const unexpected = files
    .filter((file) => !required.has(file) && !buildOutput.test(file))
    .map((file) => `unexpected ${file}`);
  return [...missing, ...unexpected];
}

/**
 * Collects every file the `exports` map of a package manifest points to.
 *
 * @param {unknown} exports - The `exports` field: a path, a list, or conditions and subpaths mapping to those.
 * @returns {string[]} The target paths relative to the package root, without duplicates.
 */
export function collectExportTargets(exports) {
  return [...new Set(targetsOf(exports))];
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function targetsOf(value) {
  if (typeof value === "string")
    return value.startsWith("./") ? [value.slice(2)] : [];
  if (Array.isArray(value)) return value.flatMap(targetsOf);
  return isRecord(value) ? Object.values(value).flatMap(targetsOf) : [];
}

/**
 * Extracts the tarball paths from what `npm pack --dry-run --json` prints.
 *
 * @param {string} output - The JSON printed by npm.
 * @returns {string[]} Paths inside the tarball, relative to the package root.
 */
export function parsePackOutput(output) {
  /** @type {unknown} */
  const report = JSON.parse(output);
  if (!Array.isArray(report) || !report.every(isTarball)) {
    throw new Error("Unexpected output from npm pack --dry-run --json");
  }
  return report.flatMap((tarball) => tarball.files.map((file) => file.path));
}

/**
 * @param {unknown} value
 * @returns {value is { files: { path: string }[] }}
 */
function isTarball(value) {
  return (
    isRecord(value) &&
    Array.isArray(value["files"]) &&
    value["files"].every(
      (/** @type {unknown} */ file) =>
        isRecord(file) && typeof file["path"] === "string",
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Exercised by running the script in the package checks; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const exportTargets = collectExportTargets(
    isRecord(manifest) ? manifest["exports"] : undefined,
  );
  const problems = findPackageContentProblems(
    parsePackOutput(output),
    exportTargets,
  );
  for (const problem of problems) console.error(`Package contents: ${problem}`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
