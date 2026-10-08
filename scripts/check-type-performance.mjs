// @ts-check
// Type-performance budget: compiles a fixture of public API calls with `tsc --extendedDiagnostics` and fails when the
// number of type instantiations exceeds the budget. Instantiations are deterministic for a given TypeScript version
// and, unlike timings, do not vary between machines, so a budget can gate CI. A change that makes the public types
// expensive shows up here before users feel it in their editors.
// Usage: node scripts/check-type-performance.mjs <tsconfig> <budget>
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Reads the instantiation count from the output of `tsc --extendedDiagnostics`.
 *
 * @param {string} output - What `tsc --extendedDiagnostics` printed.
 * @returns {number | undefined} The count, or `undefined` when the output has no such line.
 */
export function readInstantiations(output) {
  const match = /^Instantiations:\s+(\d+)$/mu.exec(output);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * Lists the reasons why a measurement is over budget.
 *
 * @param {number | undefined} instantiations - The measured count.
 * @param {number} budget - The largest acceptable count.
 * @returns {string[]} The problems; empty when the measurement is within budget.
 */
export function findBudgetProblems(instantiations, budget) {
  if (instantiations === undefined) {
    return ["tsc did not report a number of instantiations"];
  }
  return instantiations > budget
    ? [
        `${String(instantiations)} type instantiations exceed the budget of ${String(budget)}; simplify the types or, if the cost is justified, raise the budget deliberately`,
      ]
    : [];
}

// Exercised by spawning the script in the tests; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const [tsconfig, budgetText] = process.argv.slice(2);
  const budget = Number(budgetText);
  if (tsconfig === undefined || !Number.isInteger(budget) || budget <= 0) {
    throw new Error("Usage: check-type-performance.mjs <tsconfig> <budget>");
  }
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const run = spawnSync(
    process.execPath,
    [tsc, "-p", tsconfig, "--extendedDiagnostics"],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    process.exit(1);
  }
  const instantiations = readInstantiations(run.stdout);
  const problems = findBudgetProblems(instantiations, budget);
  for (const problem of problems) console.error(`Type budget: ${problem}`);
  if (problems.length === 0) {
    console.log(
      `Type budget: ${String(instantiations)} of ${String(budget)} instantiations.`,
    );
  }
  process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
