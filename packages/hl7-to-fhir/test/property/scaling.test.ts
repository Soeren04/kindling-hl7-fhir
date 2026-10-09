import { describe, expect, it } from "vitest";

import { measureScaling } from "../support/scaling";

// Each input grows by repeating one unit: many segments, lines, fields, components, subcomponents or
// escape sequences. A quadratic scan on any of them is a denial of service for untrusted input.
const header = "MSH|^~\\&|LAB|HOSP|||||ADT^A01|1|P|2.5.1\r";
const patient = `${header}PID|`;

/** A description, the text before the repeated unit, and the unit. */
type Growth = readonly [description: string, prefix: string, unit: string];

const segments: Growth = ["segments", header, "NTE\r"];
const lineFeedSegments: Growth = [
  "line feed terminated segments",
  "MSH|^~\\&|A\n",
  "PID|a\n",
];
const fields: Growth = ["fields", patient, "a|"];
const components: Growth = ["components", patient, "a^"];
const subcomponents: Growth = ["subcomponents", patient, "a&"];
const emptySubcomponents: Growth = ["empty subcomponents", patient, "&"];
const formattingEscapes: Growth = ["formatting escapes", patient, "\\.br\\"];
const unknownEscapes: Growth = ["unknown escapes", patient, "\\Q\\"];
// Lines that are dropped, so that only reading them grows.
const emptyLines: Growth = ["empty lines", header, "\r"];
const blankLines: Growth = ["blank lines", header, " \t\r"];

const scenarios: readonly (readonly [
  operation: "parse" | "stringify" | "splitBatch",
  growth: readonly Growth[],
])[] = [
  [
    "parse",
    [
      segments,
      lineFeedSegments,
      fields,
      components,
      subcomponents,
      emptySubcomponents,
      formattingEscapes,
      unknownEscapes,
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
 * A linear operation takes four times as long on four times the input; a quadratic one sixteen times. Garbage
 * collection makes a large tree somewhat more expensive per node, up to about 8 times as long here, so the limit sits
 * between that and quadratic growth.
 */
const maximumRatio = 11;
/** Absolute limit for the large input, generous enough for a slow CI runner. */
const maximumMilliseconds = 5000;
/** The worker lengthens inputs until a run takes longer than this. Below it, differences between the two runs are noise rather than growth. */
const smallestMeaningfulMilliseconds = 10;
/** The characters of the first small input. */
const initialBytes = 20_000;
/** One task may take this long; a quadratic regression then fails the test instead of hanging it. */
const timeoutMilliseconds = 20_000;

describe.each(scenarios)(
  "running time of %s grows linearly with the input",
  (operation, growth) => {
    it.each(growth)(
      "of many %s",
      // Other test files run on the same machine: a slow moment can skew one measurement, but not three in a row,
      // whereas a quadratic running time fails every time.
      { retry: 2, timeout: 3 * timeoutMilliseconds },
      async (_description, prefix, unit) => {
        const { small, large } = await measureScaling(
          { operation, prefix, unit, bytes: initialBytes },
          timeoutMilliseconds,
        );
        expect(large).toBeLessThan(maximumMilliseconds);
        expect(large).toBeLessThan(
          maximumRatio * Math.max(small, smallestMeaningfulMilliseconds),
        );
      },
    );
  },
);
