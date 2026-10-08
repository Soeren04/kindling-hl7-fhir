// @ts-check
// Fails unless the npm tarball of the current package contains exactly the build output plus the package metadata
// and legal files. Run from the package directory after the build.
import { execFileSync } from "node:child_process";

/** Files every published tarball must contain. */
const requiredFiles = ["package.json", "README.md", "LICENSE", "NOTICE"];

/** Build output: ESM and CJS bundles with their declarations, directly in dist/. */
const buildOutput = /^dist\/[\w.-]+\.(?:js|cjs|d\.ts|d\.cts)$/;

/**
 * Lists everything wrong with the given tarball contents.
 *
 * @param {readonly string[]} files - Paths inside the tarball, relative to the package root.
 * @returns {string[]} One human-readable problem per missing or unexpected file; empty when the contents are fine.
 */
export function findPackageContentProblems(files) {
  const missing = requiredFiles
    .filter((file) => !files.includes(file))
    .map((file) => `missing ${file}`);
  const unexpected = files
    .filter((file) => !requiredFiles.includes(file) && !buildOutput.test(file))
    .map((file) => `unexpected ${file}`);
  const noBuild = files.some((file) => buildOutput.test(file))
    ? []
    : ["no build output in dist/ (run the build first)"];
  return [...missing, ...unexpected, ...noBuild];
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
    typeof value === "object" &&
    value !== null &&
    "files" in value &&
    Array.isArray(value.files) &&
    value.files.every(isFileEntry)
  );
}

/**
 * @param {unknown} value
 * @returns {value is { path: string }}
 */
function isFileEntry(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string"
  );
}

if (import.meta.main) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  const problems = findPackageContentProblems(parsePackOutput(output));
  for (const problem of problems) console.error(`Package contents: ${problem}`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
