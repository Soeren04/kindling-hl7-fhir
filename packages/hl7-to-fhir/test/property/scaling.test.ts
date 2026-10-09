import { describe, it } from "vitest";

import {
  measureScaling,
  type ScalingTask,
  type ScalingTimes,
} from "../support/scaling";

// Each input grows by repeating one unit: many segments, lines, fields, components, subcomponents or
// escape sequences. A quadratic scan on any of them is a denial of service for untrusted input.
const header = "MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\r";
const patient = `${header}PID|`;

/** A description, the text before the repeated unit, the unit and the text after it. */
type Growth = readonly [
  description: string,
  prefix: string,
  unit: string,
  suffix?: string,
];

const segments: Growth = ["segments", header, "NTE\r"];
const lineFeedSegments: Growth = [
  "line feed terminated segments",
  "MSH|^~\\&|A\n",
  "PID|a\n",
];
const text: Growth = ["text", patient, "a"];
const fields: Growth = ["fields", patient, "a|"];
const components: Growth = ["components", patient, "a^"];
const subcomponents: Growth = ["subcomponents", patient, "a&"];
const emptySubcomponents: Growth = ["empty subcomponents", patient, "&"];
const formattingEscapes: Growth = ["formatting escapes", patient, "\\.br\\"];
const unknownEscapes: Growth = ["unknown escapes", patient, "\\Q\\"];
const hexadecimalEscape: Growth = [
  "bytes in one hexadecimal escape",
  `${patient}\\X`,
  "41",
  "\\",
];
const unterminatedEscape: Growth = [
  "characters in an unterminated escape",
  `${patient}\\`,
  "a",
];
// Messages whose structure, fields and values the validation walks: matched and unexpected segments, observations
// that open a group each, and long values of the types with a format.
const oruHeader = "MSH|^~\\&|LAB|HOSP|||||ORU^R01|1|P|2.5.1\rOBR|1|||c\r";
const observations: Growth = ["observations", oruHeader, "OBX|1|NM|c||5\r"];
const zSegments: Growth = ["Z segments", header, "ZPI|1\r"];
const identifiers: Growth = [
  "patient identifiers",
  `${patient}1||`,
  "a^^^H&1&ISO^MR~",
];
const numberDigits: Growth = [
  "digits of a number",
  `${oruHeader}OBX|1|NM|c||`,
  "1",
];
const codeCharacters: Growth = [
  "characters of a code",
  `${patient}1|||||||`,
  "M",
];

// Lines that are dropped, so that only reading them grows. A segment follows them: blank lines at the end of the
// input are trimmed in one step before the lines are read.
const emptyLines: Growth = ["empty lines", header, "\r", "NTE|1\r"];
const blankLines: Growth = ["blank lines", header, " \t\r", "NTE|1\r"];

type Operation = ScalingTask["operation"];

const scenarios: readonly (readonly [
  operation: Operation,
  growth: readonly Growth[],
])[] = [
  [
    "parse",
    [
      segments,
      lineFeedSegments,
      text,
      fields,
      components,
      subcomponents,
      emptySubcomponents,
      formattingEscapes,
      unknownEscapes,
      hexadecimalEscape,
      unterminatedEscape,
      emptyLines,
      blankLines,
    ],
  ],
  [
    "stringify",
    [
      segments,
      fields,
      components,
      subcomponents,
      formattingEscapes,
      unknownEscapes,
    ],
  ],
  [
    "validate",
    [
      segments,
      observations,
      zSegments,
      fields,
      components,
      subcomponents,
      identifiers,
      numberDigits,
      codeCharacters,
    ],
  ],
  ["group", [segments, observations, zSegments]],
  [
    "splitBatch",
    [
      segments,
      lineFeedSegments,
      // A splitter builds no tree, so one long line stands in for all kinds of content.
      fields,
      emptyLines,
      blankLines,
      ["messages", "", "MSH|^~\\&|a\r"],
      ["framed messages", "", "\u000BMSH|^~\\&|a\r\u001C\r"],
      ["unterminated frames", "", "\u000BMSH|^~\\&|a\r"],
      ["text outside messages", header, "x\r"],
    ],
  ],
];

/**
 * The cost of one character on the large input, relative to the small one. A linear operation costs about the same
 * per character, a quadratic one four times as much on four times the input. Garbage collection makes a large tree
 * somewhat more expensive per node, up to about twice here, so the limit sits between that and quadratic growth.
 */
const maximumCostRatio = 3;
/** Absolute limit for the large input, generous enough for a slow CI runner. */
const maximumMilliseconds = 5000;
/** A run on the small input takes at least this long; below it, differences between the sizes are noise. */
const minimumMilliseconds = 50;
/** The characters of the first small input. */
const initialBytes = 80_000;
/** One measurement may take this long; a quadratic regression then fails the test instead of hanging it. */
const timeoutMilliseconds = 12_000;
/** A measurement is repeated at most this often, so that a stray slow moment cannot fail a test on its own. */
const measurements = 3;

/**
 * Why the running time is not linear, or `undefined` when it is.
 *
 * The cost of one character on the large input is compared with the one on the small input.
 */
function nonLinearity({
  small,
  smallLength,
  large,
  largeLength,
}: ScalingTimes): string | undefined {
  const costRatio = large / largeLength / (small / smallLength);
  if (large >= maximumMilliseconds) {
    return `${large.toFixed(0)} ms for ${String(largeLength)} characters`;
  }
  return costRatio < maximumCostRatio
    ? undefined
    : `a character costs ${costRatio.toFixed(1)} times as much in ${String(largeLength)} characters as in ${String(smallLength)}`;
}

/**
 * Measures up to three times. The first linear measurement ends the test with success, because a quadratic operation
 * is never linear; two measurements that are not linear fail it, so one noisy measurement is not enough.
 */
async function assertLinear(
  operation: Operation,
  prefix: string,
  unit: string,
  suffix: string,
): Promise<void> {
  const reasons: string[] = [];
  for (let attempt = 0; attempt < measurements; attempt++) {
    const reason = await measureScaling(
      {
        operation,
        prefix,
        unit,
        suffix,
        bytes: initialBytes,
        minimumMilliseconds,
      },
      timeoutMilliseconds,
    ).then(nonLinearity, (error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    if (reason === undefined) return;
    reasons.push(reason);
    if (reasons.length > measurements / 2) {
      throw new Error(
        `${operation} on ${JSON.stringify(unit)} is not linear: ${reasons.join("; ")}`,
      );
    }
  }
}

// After the first failure the remaining scenarios are skipped: each failing scenario takes several seconds, and one
// failure is enough to fail the run.
let failed = false;

describe.each(scenarios)(
  "running time of %s grows linearly with the input",
  (operation, growth) => {
    it.for(growth)(
      "of many %s",
      { timeout: measurements * timeoutMilliseconds + 5000 },
      async ([, prefix, unit, suffix = ""], { skip }) => {
        if (failed) skip();
        await assertLinear(operation, prefix, unit, suffix).catch(
          (error: unknown) => {
            failed = true;
            throw error;
          },
        );
      },
    );
  },
);
