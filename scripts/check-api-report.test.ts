import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareApiReport,
  readDeclarations,
  writeDeclarations,
} from "./check-api-report.mjs";

describe("compareApiReport", () => {
  const build = new Map([
    ["hl7v2.d.ts", "declare function parse(): void;"],
    ["index.d.ts", "export {};"],
  ]);

  it("accepts a report equal to the build", () => {
    expect(compareApiReport(new Map(build), build)).toStrictEqual([]);
  });

  it("reports changed, new and removed declaration files", () => {
    const report = new Map([
      ["hl7v2.d.ts", "declare function parse(input: string): void;"],
      ["old.d.ts", "export {};"],
    ]);
    expect(compareApiReport(report, build)).toStrictEqual([
      "hl7v2.d.ts differs from the report",
      "index.d.ts is not in the report",
      "old.d.ts is no longer built",
    ]);
  });
});

describe("readDeclarations and writeDeclarations", () => {
  function temporaryDirectory(): string {
    return mkdtempSync(path.join(tmpdir(), "api-report-"));
  }

  it("reads only .d.ts files, sorted by name", () => {
    const directory = temporaryDirectory();
    writeFileSync(path.join(directory, "b.d.ts"), "b");
    writeFileSync(path.join(directory, "a.d.ts"), "a");
    writeFileSync(path.join(directory, "a.d.cts"), "cts");
    writeFileSync(path.join(directory, "a.js"), "js");
    expect([...readDeclarations(directory)]).toStrictEqual([
      ["a.d.ts", "a"],
      ["b.d.ts", "b"],
    ]);
  });

  it("reads a missing directory as empty", () => {
    expect(
      readDeclarations(path.join(temporaryDirectory(), "missing")).size,
    ).toBe(0);
  });

  it("makes the directory hold exactly the given declarations", () => {
    const directory = path.join(temporaryDirectory(), "api");
    writeDeclarations(
      directory,
      new Map([
        ["stale.d.ts", "old"],
        ["hl7v2.d.ts", "old"],
      ]),
    );
    writeFileSync(path.join(directory, "README.md"), "kept");
    writeDeclarations(
      directory,
      new Map([
        ["hl7v2.d.ts", "new"],
        ["index.d.ts", "index"],
      ]),
    );
    expect(readdirSync(directory).sort()).toStrictEqual([
      "README.md",
      "hl7v2.d.ts",
      "index.d.ts",
    ]);
    expect(readFileSync(path.join(directory, "hl7v2.d.ts"), "utf8")).toBe(
      "new",
    );
  });
});
