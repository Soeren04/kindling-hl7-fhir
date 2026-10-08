import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { findCommitMessageProblems } from "./check-commit-messages.mjs";
import {
  createEmptyRepository,
  git,
  isolatedEnvironment,
} from "./isolated-git.js";

const headerProblem =
  'subject must be "<type>(<optional scope>): <description>" with a type of build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test';
const lowercaseProblem = "description must start with a lowercase letter";
const periodProblem = "subject must not end with a period";
const blankLineProblem = "subject and body must be separated by a blank line";

describe("findCommitMessageProblems", () => {
  it.each([
    "feat: add escape decoding",
    "fix(hl7v2): keep empty components",
    "feat(api)!: rename convert options",
    "feat(a-b): scopes may contain hyphens",
    "revert: undo the escape decoding",
    "fix: überprüfe leere komponenten",
    "build: pin tsdown\n\nThe 0.x line may break in minor releases.",
    "docs: explain the result type\n",
    'Revert "feat: add escape decoding"',
  ])("accepts %j", (message) => {
    expect(findCommitMessageProblems(message)).toStrictEqual([]);
  });

  it.each([
    ["an unknown type", "feature: add parser"],
    ["a missing type", "add parser"],
    ["a missing space after the colon", "feat:add parser"],
    ["an uppercase scope", "feat(HL7v2): add parser"],
    ["an empty scope", "feat(): add parser"],
    ["an empty description", "feat: "],
    ["a fixup marker", "fixup! feat: add parser"],
    ["a squash marker", "squash! feat: add parser"],
    ["a revert of an invalid subject", 'Revert "Add parser"'],
    ["an unterminated revert", 'Revert "feat: add parser'],
    ["an empty message", ""],
  ])("rejects %s", (_description, message) => {
    expect(findCommitMessageProblems(message)).toStrictEqual([headerProblem]);
  });

  it("reports only the header when the header is broken", () => {
    expect(findCommitMessageProblems("Add parser.\nBecause.")).toStrictEqual([
      headerProblem,
    ]);
  });

  it("rejects a subject longer than 72 characters", () => {
    const message = `feat: ${"a".repeat(67)}`;
    expect(message.split("\n")[0]).toHaveLength(73);
    expect(findCommitMessageProblems(message)).toStrictEqual([
      "subject is longer than 72 characters",
    ]);
    expect(findCommitMessageProblems(message.slice(0, 72))).toStrictEqual([]);
  });

  it.each([
    ["an ASCII capital", "fix: Keep empty components"],
    ["a non-ASCII capital", "fix: Überprüfe leere Komponenten"],
  ])("rejects an uppercase description with %s", (_description, message) => {
    expect(findCommitMessageProblems(message)).toStrictEqual([
      lowercaseProblem,
    ]);
  });

  it("checks the original subject of a revert", () => {
    expect(
      findCommitMessageProblems('Revert "fix: Keep empty components"'),
    ).toStrictEqual([lowercaseProblem]);
  });

  it("rejects a trailing period", () => {
    expect(
      findCommitMessageProblems("fix: keep empty components."),
    ).toStrictEqual([periodProblem]);
  });

  it("rejects a body without a blank line after the subject", () => {
    expect(
      findCommitMessageProblems(
        "fix: keep empty components\nBecause they matter.",
      ),
    ).toStrictEqual([blankLineProblem]);
  });

  it("reports every broken rule in a fixed order", () => {
    const subject = `fix: Keep ${"a".repeat(63)}.`;
    expect(findCommitMessageProblems(`${subject}\nBecause.`)).toStrictEqual([
      "subject is longer than 72 characters",
      lowercaseProblem,
      periodProblem,
      blankLineProblem,
    ]);
  });
});

const script = path.resolve(import.meta.dirname, "check-commit-messages.mjs");
const repositories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const repository of repositories.splice(0))
    rmSync(repository, { recursive: true, force: true });
});

/** Creates a repository whose `main` branch holds one valid commit and checks out a `topic` branch from it. */
function createRepository(): string {
  const repository = createEmptyRepository("commit-messages-");
  repositories.push(repository);
  git(repository, "commit", "--quiet", "--allow-empty", "-m", "chore: base");
  git(repository, "checkout", "--quiet", "-b", "topic");
  return repository;
}

function commit(repository: string, message: string): string {
  git(repository, "commit", "--quiet", "--allow-empty", "-m", message);
  return git(repository, "rev-parse", "HEAD");
}

function check(repository: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repository,
    env: isolatedEnvironment(repository),
    encoding: "utf8",
  });
}

describe("check-commit-messages.mjs", () => {
  it("passes when every commit after the base is valid", () => {
    const repository = createRepository();
    commit(repository, "feat: add parser");
    commit(repository, 'Revert "feat: add parser"');
    const result = check(repository, "main");
    expect(result).toMatchObject({
      status: 0,
      stdout: "Checked 2 commit message(s).\n",
      stderr: "",
    });
  });

  it("passes for an empty range", () => {
    expect(check(createRepository(), "main")).toMatchObject({
      status: 0,
      stdout: "Checked 0 commit message(s).\n",
      stderr: "",
    });
  });

  it("ignores commits that are already on the base", () => {
    const repository = createRepository();
    git(repository, "checkout", "--quiet", "main");
    commit(repository, "Not conventional at all");
    git(repository, "checkout", "--quiet", "topic");
    git(repository, "rebase", "--quiet", "main");
    commit(repository, "fix: keep empty components");
    expect(check(repository, "main")).toMatchObject({
      status: 0,
      stdout: "Checked 1 commit message(s).\n",
    });
  });

  it("reports every problem of every bad commit and fails", () => {
    const repository = createRepository();
    const bad = commit(repository, "Add parser");
    commit(repository, "fix: keep empty components");
    const worse = commit(repository, "fix: Keep empty components.");
    const result = check(repository, "main");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("Checked 3 commit message(s).\n");
    expect(result.stderr).toBe(
      [
        `${bad.slice(0, 12)}: ${headerProblem}`,
        `${worse.slice(0, 12)}: ${lowercaseProblem}`,
        `${worse.slice(0, 12)}: ${periodProblem}`,
        "",
      ].join("\n"),
    );
  });

  it("rejects merge commits", () => {
    const repository = createRepository();
    git(repository, "checkout", "--quiet", "-b", "side", "main");
    commit(repository, "fix: handle the side case");
    git(repository, "checkout", "--quiet", "topic");
    commit(repository, "feat: add parser");
    git(repository, "merge", "--quiet", "--no-ff", "-m", "feat: merge", "side");
    const merge = git(repository, "rev-parse", "HEAD");
    const result = check(repository, "main");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("Checked 3 commit message(s).\n");
    expect(result.stderr).toBe(
      `${merge.slice(0, 12)}: merge commits are not allowed; rebase onto the base branch instead\n`,
    );
  });

  it("fails with a usage message when the base revision is missing", () => {
    const result = check(createRepository());
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Usage: check-commit-messages.mjs <base-revision>",
    );
  });

  it("fails when the base revision does not exist", () => {
    const result = check(createRepository(), "no-such-branch");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("test isolation", () => {
  function snapshot(repository: string) {
    return {
      log: git(repository, "log", "--format=%H %s"),
      bare: git(repository, "config", "--get", "core.bare"),
      branches: git(repository, "branch", "--list"),
    };
  }

  it("never touches the repository named by an inherited GIT_DIR", () => {
    const decoy = createEmptyRepository("decoy-");
    repositories.push(decoy);
    git(decoy, "commit", "--quiet", "--allow-empty", "-m", "chore: decoy");
    const before = snapshot(decoy);

    vi.stubEnv("GIT_DIR", path.join(decoy, ".git"));
    vi.stubEnv("GIT_WORK_TREE", decoy);
    vi.stubEnv("GIT_INDEX_FILE", path.join(decoy, ".git", "index"));
    const repository = createRepository();
    commit(repository, "feat: add parser");
    const result = check(repository, "main");
    vi.unstubAllEnvs();

    expect(result).toMatchObject({
      status: 0,
      stdout: "Checked 1 commit message(s).\n",
    });
    expect(git(repository, "log", "--format=%s")).toBe(
      "feat: add parser\nchore: base",
    );
    expect(snapshot(decoy)).toStrictEqual(before);
  });

  it("drops every GIT_ variable and fences discovery at the repository's parent", () => {
    const repository = path.join(path.sep, "tmp", "repository");
    expect(
      isolatedEnvironment(repository, {
        GIT_DIR: "x",
        git_work_tree: "y",
        PATH: "/bin",
        HOME: "/home/user",
      }),
    ).toStrictEqual({
      PATH: "/bin",
      GIT_CEILING_DIRECTORIES: path.join(path.sep, "tmp"),
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: repository,
      USERPROFILE: repository,
    });
  });
});
