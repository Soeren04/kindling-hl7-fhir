// @ts-check
// Release guard: fails unless the pushed tag is exactly `v` + the version in packages/hl7-to-fhir/package.json and
// that version is a plain MAJOR.MINOR.PATCH release (no prerelease or build metadata).
// Usage: node scripts/check-version.mjs <tag>
import { readFileSync } from "node:fs";
import path from "node:path";

const releaseVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

/**
 * Lists every reason why `tag` must not publish a package with `version`.
 *
 * @param {string} tag - The Git tag that triggered the release, e.g. `v1.2.3`.
 * @param {unknown} version - The `version` field of the package manifest.
 * @returns {string[]} The problems; empty when the tag may publish the package.
 */
export function findReleaseProblems(tag, version) {
  if (typeof version !== "string" || !releaseVersion.test(version)) {
    return [
      `package version ${JSON.stringify(version)} is not a MAJOR.MINOR.PATCH release version`,
    ];
  }
  if (tag !== `v${version}`) {
    return [
      `tag "${tag}" does not match the package version; expected "v${version}"`,
    ];
  }
  return [];
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (tag === undefined) throw new Error("Usage: check-version.mjs <tag>");
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../packages/hl7-to-fhir/package.json",
  );
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? manifest.version
      : undefined;
  const problems = findReleaseProblems(tag, version);
  for (const problem of problems) console.error(`Release guard: ${problem}`);
  if (problems.length === 0)
    console.log(`Release guard: tag ${tag} matches the package version.`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
