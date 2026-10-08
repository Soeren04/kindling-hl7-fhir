import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findReleaseProblems } from "./check-version.mjs";

describe("findReleaseProblems", () => {
  it.each([
    ["v1.0.0", "1.0.0"],
    ["v0.1.0", "0.1.0"],
    ["v10.20.30", "10.20.30"],
  ])("lets %s publish version %s", (tag, version) => {
    expect(findReleaseProblems(tag, version)).toStrictEqual([]);
  });

  it.each([
    ["a different version", "v1.0.1"],
    ["a missing v prefix", "1.0.0"],
    ["an uppercase V prefix", "V1.0.0"],
    ["a prerelease suffix", "v1.0.0-rc.1"],
    ["leading whitespace", " v1.0.0"],
    ["a trailing space", "v1.0.0 "],
    ["a trailing newline", "v1.0.0\n"],
    ["a leading zero", "v01.0.0"],
  ])("rejects a tag with %s", (_description, tag) => {
    expect(findReleaseProblems(tag, "1.0.0")).toStrictEqual([
      `tag "${tag}" does not match the package version; expected "v1.0.0"`,
    ]);
  });

  it.each([
    ["a prerelease", "1.0.0-rc.1"],
    ["build metadata", "1.0.0+build.5"],
    ["a leading zero", "01.0.0"],
    ["a trailing newline", "1.0.0\n"],
    ["a trailing space", "1.0.0 "],
    ["a v prefix", "v1.0.0"],
    ["a missing patch number", "1.0"],
    ["a missing version", undefined],
    ["a non-string version", 1],
  ])("rejects a package version with %s", (_description, version) => {
    expect(findReleaseProblems(`v${String(version)}`, version)).toStrictEqual([
      `package version ${JSON.stringify(version)} is not a MAJOR.MINOR.PATCH release version`,
    ]);
  });

  it("rejects a prerelease even when the tag matches it exactly", () => {
    expect(findReleaseProblems("v2.0.0-beta.1", "2.0.0-beta.1")).toStrictEqual([
      'package version "2.0.0-beta.1" is not a MAJOR.MINOR.PATCH release version',
    ]);
  });
});

const script = path.resolve(import.meta.dirname, "check-version.mjs");
const manifest = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../packages/hl7-to-fhir/package.json"),
    "utf8",
  ),
) as { version: string };

function check(...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

describe("check-version.mjs", () => {
  it("accepts the tag of the current package version", () => {
    const tag = `v${manifest.version}`;
    expect(check(tag)).toMatchObject({
      status: 0,
      stdout: `Release guard: tag ${tag} matches the package version.\n`,
      stderr: "",
    });
  });

  it("rejects a tag of another version", () => {
    const result = check("v0.0.0");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      `Release guard: tag "v0.0.0" does not match the package version; expected "v${manifest.version}"\n`,
    );
  });

  it("fails with a usage message when the tag is missing", () => {
    const result = check();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: check-version.mjs <tag>");
  });
});
