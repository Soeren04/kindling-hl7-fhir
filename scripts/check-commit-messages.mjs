// @ts-check
// Checks that every commit in a range follows the Conventional Commits rules in CONTRIBUTING.md.
// Usage: node scripts/check-commit-messages.mjs <base-revision>  (checks <base-revision>..HEAD)
import { execFileSync } from "node:child_process";

const types = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];
const maxSubjectLength = 72;
const header = new RegExp(
  `^(?:${types.join("|")})(?:\\([a-z0-9-]+\\))?!?: \\S`,
  "u",
);

/**
 * Lists every rule a commit message breaks.
 *
 * @param {string} message - The full commit message as printed by `git log --format=%B`.
 * @returns {string[]} One problem per broken rule; empty when the message is fine.
 */
export function findCommitMessageProblems(message) {
  const [subject = "", secondLine] = message.trimEnd().split("\n");
  const problems = [];
  if (!header.test(subject)) {
    problems.push(
      `subject must be "<type>(<optional scope>): <description>" with a type of ${types.join(", ")}`,
    );
  }
  if (subject.length > maxSubjectLength)
    problems.push(
      `subject is longer than ${String(maxSubjectLength)} characters`,
    );
  const description = subject.slice(subject.indexOf(": ") + 2);
  if (/^[A-Z]/u.test(description))
    problems.push("description must start with a lowercase letter");
  if (subject.endsWith("."))
    problems.push("subject must not end with a period");
  if (secondLine !== undefined && secondLine !== "")
    problems.push("subject and body must be separated by a blank line");
  return problems;
}

/**
 * Runs git and returns its trimmed standard output.
 *
 * @param {string[]} args - Arguments for git.
 * @returns {string} The output without the trailing newline.
 */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

if (import.meta.main) {
  const base = process.argv[2];
  if (base === undefined)
    throw new Error("Usage: check-commit-messages.mjs <base-revision>");
  const commits = git(["rev-list", "--reverse", `${base}..HEAD`])
    .split("\n")
    .filter(Boolean);
  let failed = false;
  for (const commit of commits) {
    const parents =
      git(["rev-list", "--parents", "--max-count=1", commit]).split(" ")
        .length - 1;
    const problems = [
      ...(parents > 1
        ? ["merge commits are not allowed; rebase onto the base branch instead"]
        : []),
      ...findCommitMessageProblems(
        git(["log", "--max-count=1", "--format=%B", commit]),
      ),
    ];
    for (const problem of problems)
      console.error(`${commit.slice(0, 12)}: ${problem}`);
    failed ||= problems.length > 0;
  }
  console.log(`Checked ${String(commits.length)} commit message(s).`);
  process.exitCode = failed ? 1 : 0;
}
