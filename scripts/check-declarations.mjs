// @ts-check
// Checks what the shipped declarations in dist/ must and must not contain, beyond the API report (ADR 0007):
//   1. no generated names such as `Segment$1`: the declaration bundler adds `$1` when two declarations share a name,
//      and users would see the suffix in their editor, so one of the two is renamed in the source;
//   2. no reference to the project's internal ADRs in a doc comment, which readers of the package cannot open;
//   3. every union of codes (`IssueCode`, `PathFailureCode`, ...) lists each of its members in its doc comment,
//      because the bundler drops the comments on the members and the list is all that users can read.
// Usage: `node check-declarations.mjs <directory with .d.ts files>`.
import { readDeclarations } from "./check-api-report.mjs";

/** A name the bundler made unique, such as `Segment$1`. */
const generatedName = /\b[A-Za-z_]\w*\$\d+\b/gu;

/** An internal decision record, such as `ADR 0008`. */
const decisionRecord = /\bADR[ -]?\d{4}\b/gu;

/**
 * A union of codes with the doc comment right before it, if any: `type IssueCode = "A" | "B";`. The pattern ends at
 * the first semicolon, which no code and no doc comment contains.
 */
const codeUnion =
  /(\/\*\*(?:[^*]|\*(?!\/))*\*\/\s*)?(?:declare )?type (\w+Code) =([^;]*);/gu;

/** A code in a doc comment: a list item that starts with the code in backticks. */
const documentedCode = /^[ \t]*\*[ \t]+- `([A-Z][A-Z0-9_]*)`/gmu;

/** A code in a union: a string literal in upper-case snake case. */
const memberCode = /"([A-Z][A-Z0-9_]*)"/gu;

/**
 * Lists everything wrong in the declaration files.
 *
 * @param {ReadonlyMap<string, string>} declarations - Content by file name.
 * @returns {string[]} One human-readable problem per finding; empty when the declarations are fine.
 */
export function findDeclarationProblems(declarations) {
  /** @type {string[]} */
  const problems = [];
  for (const [name, text] of declarations) {
    const generated = new Set(text.match(generatedName));
    for (const identifier of generated) {
      problems.push(
        `${name} contains the generated name ${identifier}; two declarations share a name, rename one in the source`,
      );
    }
    for (const reference of new Set(text.match(decisionRecord))) {
      problems.push(
        `${name} refers to ${reference}, which users cannot open; state the rule in the doc comment instead`,
      );
    }
    for (const [, comment, type = "", union = ""] of text.matchAll(codeUnion)) {
      problems.push(...findUndocumentedCodes(name, type, comment, union));
    }
  }
  return problems;
}

/**
 * @param {string} text - The text to search.
 * @param {RegExp} pattern - A global pattern whose first group is a code.
 * @returns {string[]} The codes in order of appearance.
 */
function codesIn(text, pattern) {
  return Array.from(text.matchAll(pattern), ([, code = ""]) => code);
}

/**
 * Compares the codes of a union with the codes its doc comment lists.
 *
 * @param {string} file - The declaration file, for the messages.
 * @param {string} type - The name of the union.
 * @param {string | undefined} comment - The doc comment before the union, if any.
 * @param {string} union - The text of the union.
 * @returns {string[]} The problems found.
 */
function findUndocumentedCodes(file, type, comment, union) {
  if (comment === undefined) {
    return [`${file}: ${type} has no doc comment listing its codes`];
  }
  const members = new Set(codesIn(union, memberCode));
  const documented = new Set(codesIn(comment, documentedCode));
  return [
    ...Array.from(members)
      .filter((code) => !documented.has(code))
      .map((code) => `${file}: ${type} does not document ${code}`),
    ...Array.from(documented)
      .filter((code) => !members.has(code))
      .map(
        (code) =>
          `${file}: ${type} documents ${code}, which it does not contain`,
      ),
  ];
}

// Exercised by spawning the script in the tests and by `pnpm check:api`; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const directory = process.argv[2] ?? ".";
  const declarations = readDeclarations(directory);
  const problems = findDeclarationProblems(declarations);
  for (const problem of problems) console.error(`Declarations: ${problem}`);
  if (declarations.size === 0) {
    console.error(`Declarations: no .d.ts files in ${directory}`);
  }
  process.exitCode = problems.length === 0 && declarations.size > 0 ? 0 : 1;
}
/* v8 ignore stop */
