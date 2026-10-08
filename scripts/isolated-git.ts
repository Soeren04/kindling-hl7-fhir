// Test support: runs git and scripts against a throwaway repository and nothing else.
//
// Git hooks and worktrees export GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and friends. A child process that inherits them
// ignores its working directory and operates on the repository that started the test run, so every process a test
// spawns gets the environment built here instead.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Builds the environment for a child process that must only ever see `repository`.
 *
 * Drops every inherited `GIT_*` variable, stops git's repository discovery above `repository`, ignores the system
 * configuration and uses `repository` as the home directory so no user configuration is read either.
 *
 * @param repository - The throwaway repository's directory.
 * @param inherited - The variables to start from.
 * @returns The sanitized environment.
 */
export function isolatedEnvironment(
  repository: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const kept = Object.entries(inherited).filter(
    // Environment variable names are case-insensitive on Windows.
    ([name]) => !name.toUpperCase().startsWith("GIT_"),
  );
  return {
    ...Object.fromEntries(kept),
    GIT_CEILING_DIRECTORIES: path.dirname(repository),
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: repository,
    USERPROFILE: repository,
  };
}

/**
 * Runs git inside a throwaway repository with a fixed identity and no signing.
 *
 * @param repository - The throwaway repository's directory.
 * @param args - Arguments for git.
 * @returns The trimmed standard output.
 */
export function git(repository: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    {
      cwd: repository,
      env: isolatedEnvironment(repository),
      encoding: "utf8",
    },
  ).trim();
}

/**
 * Creates an empty repository with a `main` branch in a new temporary directory.
 *
 * @param prefix - Prefix for the directory name.
 * @returns The repository's absolute path; the caller removes it.
 */
export function createEmptyRepository(prefix: string): string {
  const repository = mkdtempSync(path.join(tmpdir(), prefix));
  // The explicit directory makes `git init` independent of the working directory.
  git(repository, "init", "--quiet", "--initial-branch=main", repository);
  return repository;
}
