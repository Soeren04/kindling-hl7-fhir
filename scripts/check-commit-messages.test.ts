import { describe, expect, it } from "vitest";

import { findCommitMessageProblems } from "./check-commit-messages.mjs";

describe("findCommitMessageProblems", () => {
  it.each([
    "feat: add escape decoding",
    "fix(hl7v2): keep empty components",
    "feat(api)!: rename convert options",
    "build: pin tsdown\n\nThe 0.x line may break in minor releases.",
    "docs: explain the result type\n",
  ])("accepts %j", (message) => {
    expect(findCommitMessageProblems(message)).toStrictEqual([]);
  });

  it.each([
    ["an unknown type", "feature: add parser"],
    ["a missing type", "add parser"],
    ["a missing space after the colon", "feat:add parser"],
    ["an uppercase scope", "feat(HL7v2): add parser"],
    ["an empty description", "feat: "],
  ])("rejects %s", (_description, message) => {
    expect(findCommitMessageProblems(message)).toContainEqual(
      expect.stringMatching(/^subject must be/u),
    );
  });

  it("rejects a subject longer than 72 characters", () => {
    const message = `feat: ${"a".repeat(67)}`;
    expect(message.split("\n")[0]).toHaveLength(73);
    expect(findCommitMessageProblems(message)).toStrictEqual([
      "subject is longer than 72 characters",
    ]);
    expect(findCommitMessageProblems(message.slice(0, 72))).toStrictEqual([]);
  });

  it("rejects an uppercase description", () => {
    expect(
      findCommitMessageProblems("fix: Keep empty components"),
    ).toStrictEqual(["description must start with a lowercase letter"]);
  });

  it("rejects a trailing period", () => {
    expect(
      findCommitMessageProblems("fix: keep empty components."),
    ).toStrictEqual(["subject must not end with a period"]);
  });

  it("rejects a body without a blank line after the subject", () => {
    expect(
      findCommitMessageProblems(
        "fix: keep empty components\nBecause they matter.",
      ),
    ).toStrictEqual(["subject and body must be separated by a blank line"]);
  });
});
