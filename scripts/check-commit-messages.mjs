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
const gitRevert = /^Revert "(.*)"$/u;

/**
 * Lists every rule a commit message breaks.
 *
 * Git's default message for a revert, `Revert "<original subject>"`, is accepted when the original subject is valid.
 * Autosquash subjects (`fixup!`, `squash!`) are rejected: they must be squashed before a pull request is ready.
 *
 * @param {string} message - The full commit message as printed by `git log --format=%B`.
 * @returns {string[]} One problem per broken rule; empty when the message is fine.
 */
export function findCommitMessageProblems(message) {
  const [fullSubject = "", secondLine] = message.trimEnd().split("\n");
  const subject = fullSubject.replace(gitRevert, "$1");
  if (!header.test(subject)) {
    // The remaining rules read the description, which only exists behind a valid header.
    return [
      `subject must be "<type>(<optional scope>): <description>" with a type of ${types.join(", ")}`,
    ];
  }
  const problems = [];
  if (subject.length > maxSubjectLength)
    problems.push(
      `subject is longer than ${String(maxSubjectLength)} characters`,
    );
  // The header test guarantees ": ", and its first occurrence ends the type and the scope.
  const description = subject.slice(subject.indexOf(": ") + 2);
  if (/^\p{Lu}/u.test(description))
    problems.push("description must start with a lowercase letter");
  if (subject.endsWith("."))
    problems.push("subject must not end with a period");
  if (secondLine !== undefined && secondLine !== "")
    problems.push("subject and body must be separated by a blank line");
  return problems;
}

// Exercised by spawning the script in the tests; V8 coverage cannot follow child processes.
/* v8 ignore start */
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
/* v8 ignore stop */
