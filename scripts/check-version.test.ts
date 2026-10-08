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
    ["surrounding whitespace", " v1.0.0"],
  ])("rejects a tag with %s", (_description, tag) => {
    expect(findReleaseProblems(tag, "1.0.0")).toStrictEqual([
      `tag "${tag}" does not match the package version; expected "v1.0.0"`,
    ]);
  });

  it.each([
    ["a prerelease", "1.0.0-rc.1"],
    ["build metadata", "1.0.0+build.5"],
    ["a leading zero", "01.0.0"],
    ["a missing patch number", "1.0"],
    ["a missing version", undefined],
    ["a non-string version", 1],
  ])("rejects a package version with %s", (_description, version) => {
    expect(findReleaseProblems(`v${String(version)}`, version)).toStrictEqual([
      `package version ${JSON.stringify(version)} is not a MAJOR.MINOR.PATCH release version`,
    ]);
  });

  it("rejects a prerelease even when the tag matches it exactly", () => {
    expect(findReleaseProblems("v2.0.0-beta.1", "2.0.0-beta.1")).toHaveLength(
      1,
    );
  });
});
