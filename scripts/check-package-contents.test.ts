import { describe, expect, it } from "vitest";

import {
  findPackageContentProblems,
  parsePackOutput,
} from "./check-package-contents.mjs";

const metadata = ["package.json", "README.md", "LICENSE", "NOTICE"];
const build = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
];

describe("findPackageContentProblems", () => {
  it("accepts the build output plus metadata and legal files", () => {
    expect(findPackageContentProblems([...metadata, ...build])).toStrictEqual(
      [],
    );
  });

  it.each(metadata)("reports a missing %s", (file) => {
    const files = [...metadata.filter((name) => name !== file), ...build];
    expect(findPackageContentProblems(files)).toStrictEqual([
      `missing ${file}`,
    ]);
  });

  it.each([
    "src/index.ts",
    "test/shared/result.test.ts",
    "tsconfig.json",
    "dist/index.js.map",
    "dist/nested/x.js",
  ])("reports %s as unexpected", (file) => {
    expect(
      findPackageContentProblems([...metadata, ...build, file]),
    ).toStrictEqual([`unexpected ${file}`]);
  });

  it("reports a package without build output", () => {
    expect(findPackageContentProblems(metadata)).toStrictEqual([
      "no build output in dist/ (run the build first)",
    ]);
  });
});

describe("parsePackOutput", () => {
  it("returns the paths of every packed file", () => {
    const output = JSON.stringify([
      {
        name: "hl7-to-fhir",
        files: [
          { path: "LICENSE", size: 1 },
          { path: "dist/index.js", size: 2 },
        ],
      },
    ]);
    expect(parsePackOutput(output)).toStrictEqual(["LICENSE", "dist/index.js"]);
  });

  it.each([
    ["an object instead of an array", "{}"],
    ["a tarball without files", '[{ "name": "hl7-to-fhir" }]'],
    ["a file without a path", '[{ "files": [{ "size": 1 }] }]'],
  ])("rejects %s", (_description, output) => {
    expect(() => parsePackOutput(output)).toThrow(
      "Unexpected output from npm pack",
    );
  });
});
