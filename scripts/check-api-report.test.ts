import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

describe("check-api-report command", () => {
  const script = path.resolve(import.meta.dirname, "check-api-report.mjs");
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /** A throwaway package directory with the given built and committed declarations. */
  function packageDirectory(
    built: Record<string, string>,
    committed?: Record<string, string>,
  ): string {
    const directory = mkdtempSync(path.join(tmpdir(), "api-report-cli-"));
    directories.push(directory);
    for (const [folder, files] of [
      ["dist", built],
      ["api", committed],
    ] as const) {
      if (files === undefined) continue;
      mkdirSync(path.join(directory, folder));
      for (const [name, text] of Object.entries(files)) {
        writeFileSync(path.join(directory, folder, name), text);
      }
    }
    return directory;
  }

  function run(directory: string, ...args: string[]) {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [script, ...args],
      { cwd: directory, encoding: "utf8" },
    );
    return { status, stdout, stderr };
  }

  it("exits with 0 when the report equals the build", () => {
    const files = { "index.d.ts": "export {};" };
    expect(run(packageDirectory(files, files))).toStrictEqual({
      status: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("exits with 1 and explains how to update when they differ", () => {
    const { status, stderr } = run(
      packageDirectory(
        { "index.d.ts": "export type A = 1;" },
        { "index.d.ts": "export {};" },
      ),
    );
    expect(status).toBe(1);
    expect(stderr).toBe(
      "API report: index.d.ts differs from the report\n" +
        "If the API change is intended, run `pnpm update:api` and commit packages/hl7-to-fhir/api/.\n",
    );
  });

  it("exits with 1 when there is no report at all", () => {
    const { status, stderr } = run(
      packageDirectory({ "index.d.ts": "export {};" }),
    );
    expect(status).toBe(1);
    expect(stderr).toContain("API report: index.d.ts is not in the report");
  });

  it("exits with 1 when nothing was built", () => {
    const { status, stderr } = run(packageDirectory({}, {}));
    expect(status).toBe(1);
    expect(stderr).toContain("run `pnpm build` first");
  });

  it("rewrites the report with --update and names what changed", () => {
    const directory = packageDirectory(
      { "index.d.ts": "export type A = 1;", "new.d.ts": "export {};" },
      { "index.d.ts": "export {};", "old.d.ts": "export {};" },
    );
    const { status, stdout } = run(directory, "--update");
    expect(status).toBe(0);
    expect(stdout).toBe(
      "API report: updated api/ (index.d.ts differs from the report; new.d.ts is not in the report; old.d.ts is no longer built).\n",
    );
    expect(readdirSync(path.join(directory, "api")).sort()).toStrictEqual([
      "index.d.ts",
      "new.d.ts",
    ]);
    expect(run(directory).status).toBe(0);
  });

  it("says so when --update has nothing to do", () => {
    const files = { "index.d.ts": "export {};" };
    const { status, stdout } = run(packageDirectory(files, files), "--update");
    expect(status).toBe(0);
    expect(stdout).toBe("API report: api/ is already up to date.\n");
  });
});
