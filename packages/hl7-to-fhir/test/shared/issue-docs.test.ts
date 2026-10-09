// The doc comment of IssueCode is the only documentation of the codes that reaches users: the declaration bundler drops
// the comments on the members of the union. `check:api` verifies that the shipped declarations list every code; this
// test checks the list against the table that defines severity and message, which only the source has.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { issueDefinitions } from "../../src/shared/issue-table";

const source = readFileSync(
  new URL("../../src/shared/issue.ts", import.meta.url),
  "utf8",
);

/** The code and severity of every list item of the doc comment before `export type IssueCode`. */
function documentedSeverities(): Map<string, string> {
  const comment =
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export type IssueCode\b/u.exec(
      source,
    )?.[1];
  const items = (comment ?? "").matchAll(
    /^[ \t]*\*[ \t]+- `([A-Z_]+)` \((error|warning|info)\)/gmu,
  );
  return new Map(
    Array.from(items, ([, code = "", severity = ""]) => [code, severity]),
  );
}

/**
 * The text of every list item of the doc comment, keyed by code, each with the heading of its section, which can say
 * what `value` holds for every item below it.
 */
function documentedItems(): Map<string, string> {
  const comment =
    /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export type IssueCode\b/u.exec(
      source,
    )?.[1];
  const lines = (comment ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/u, ""));
  const items = new Map<string, string>();
  let heading = "";
  let code: string | undefined;
  for (const line of lines) {
    const item = /^- `([A-Z_]+)`/u.exec(line);
    if (item !== null) {
      code = item[1];
      if (code !== undefined) items.set(code, `${heading} ${line}`);
    } else if (line.startsWith("  ") && code !== undefined) {
      items.set(code, `${items.get(code) ?? ""} ${line.trim()}`);
    } else {
      code = undefined;
      if (line.endsWith(":")) heading = line;
    }
  }
  return items;
}

describe("the IssueCode documentation", () => {
  it("says for every code what the issue value holds", () => {
    const silent = [...documentedItems()]
      .filter(([, text]) => !text.includes("`value`"))
      .map(([code]) => code);
    expect(silent).toStrictEqual([]);
  });

  const documented = documentedSeverities();

  it("lists every code of the table and nothing else", () => {
    expect(Array.from(documented.keys()).sort()).toStrictEqual(
      Object.keys(issueDefinitions).sort(),
    );
  });

  it("states the severity of the table for every code", () => {
    const stated = Object.fromEntries(documented);
    const defined = Object.fromEntries(
      Object.entries(issueDefinitions).map(([code, { severity }]) => [
        code,
        severity,
      ]),
    );
    expect(stated).toStrictEqual(defined);
  });
});
