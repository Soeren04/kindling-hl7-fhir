import { describe, expect, it } from "vitest";

import {
  collectExportTargets,
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
const exportTargets = [...build, "package.json"];

describe("findPackageContentProblems", () => {
  it("accepts the build output plus metadata and legal files", () => {
    expect(
      findPackageContentProblems([...metadata, ...build], exportTargets),
    ).toStrictEqual([]);
  });

  it.each(metadata)("reports a missing %s", (file) => {
    const files = [...metadata.filter((name) => name !== file), ...build];
    expect(findPackageContentProblems(files, exportTargets)).toStrictEqual([
      `missing ${file}`,
    ]);
  });

  it.each(build)("reports the missing export target %s", (file) => {
    const files = [...metadata, ...build.filter((name) => name !== file)];
    expect(findPackageContentProblems(files, exportTargets)).toStrictEqual([
      `missing ${file}`,
    ]);
  });

  it("reports a package without build output", () => {
    expect(findPackageContentProblems(metadata, exportTargets)).toStrictEqual(
      build.map((file) => `missing ${file}`),
    );
  });

  it("requires export targets outside dist/ as well", () => {
    expect(
      findPackageContentProblems(
        [...metadata, ...build],
        [...exportTargets, "cli.js"],
      ),
    ).toStrictEqual(["missing cli.js"]);
  });

  it.each([
    "src/index.ts",
    "test/shared/result.test.ts",
    "tsconfig.json",
    "dist/index.js.map",
    "dist/nested/x.js",
  ])("reports %s as unexpected", (file) => {
    expect(
      findPackageContentProblems([...metadata, ...build, file], exportTargets),
    ).toStrictEqual([`unexpected ${file}`]);
  });

  it("accepts other build output next to the exported files", () => {
    expect(
      findPackageContentProblems(
        [...metadata, ...build, "dist/chunk-abc.js"],
        exportTargets,
      ),
    ).toStrictEqual([]);
  });
});

describe("collectExportTargets", () => {
  it("collects every file of conditions and subpaths without duplicates", () => {
    const exports = {
      ".": {
        import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
      },
      "./package.json": "./package.json",
      "./again": "./dist/index.js",
    };
    expect(collectExportTargets(exports)).toStrictEqual([
      "dist/index.d.ts",
      "dist/index.js",
      "dist/index.d.cts",
      "dist/index.cjs",
      "package.json",
    ]);
  });

  it("reads a plain string and fallback lists", () => {
    expect(collectExportTargets("./dist/index.js")).toStrictEqual([
      "dist/index.js",
    ]);
    expect(
      collectExportTargets({ ".": ["./dist/a.js", "./dist/b.js"] }),
    ).toStrictEqual(["dist/a.js", "dist/b.js"]);
  });

  it.each([
    ["a missing field", undefined],
    ["a blocked subpath", { "./internal": null }],
    ["a target outside the package", { ".": "../outside.js" }],
  ])("finds nothing for %s", (_description, exports) => {
    expect(collectExportTargets(exports)).toStrictEqual([]);
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
