import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";

import { splitBatch } from "../../src/hl7v2/batch";

const terminator = fc.constantFrom("\r", "\n", "\r\n");

/** A message as lines that end with `terminator`; no line looks like an envelope segment or contains a block. */
const message = fc
  .record({
    terminator,
    header: fc.stringMatching(/^[A-Za-z0-9 ]{0,12}$/u),
    segments: fc.array(
      fc.tuple(
        fc.constantFrom("PID", "OBX", "NTE", "ZPI"),
        fc.stringMatching(/^[A-Za-z0-9^~&\\ ]{0,20}$/u),
      ),
      { maxLength: 4 },
    ),
    blankLines: fc.nat(2),
  })
  .map(({ terminator: end, header, segments, blankLines }) => ({
    text: [
      `MSH|^~\\&|${header}`,
      ...segments.map(([id, rest]) => `${id}|${rest}`),
    ]
      .map((line) => line + end)
      .join(""),
    /** Whitespace-only lines that may follow the message. */
    gap: (" " + end).repeat(blankLines),
  }));

const batches = fc.array(fc.array(message, { maxLength: 4 }), { maxLength: 3 });

type Framing = "none" | "batch" | "mllp";

/** Joins the messages of the batches the way `framing` says; the lines of an envelope use `end`. */
function frame(
  batchList: readonly (readonly { text: string; gap: string }[])[],
  framing: Framing,
  end: string,
): string {
  const messages = batchList.flat();
  switch (framing) {
    case "none":
      return messages.map(({ text, gap }) => text + gap).join("");
    case "mllp":
      return messages
        .map(({ text, gap }) => `\u000B${text}\u001C\r${gap}`)
        .join("");
    case "batch":
      return [
        `FHS|^~\\&|A${end}`,
        ...batchList.flatMap((batch) => [
          `BHS|^~\\&|B${end}`,
          ...batch.map(({ text, gap }) => text + gap),
          `BTS|${String(batch.length)}${end}`,
        ]),
        `FTS|${String(batchList.length)}${end}`,
      ].join("");
  }
}

describe("splitBatch properties", () => {
  propertyTest.prop(
    [batches, fc.constantFrom<Framing>("none", "batch", "mllp"), terminator],
    { numRuns: 500 },
  )(
    "returns the messages that were joined with any supported framing",
    (batchList, framing, end) => {
      const { messages, issues } = splitBatch(frame(batchList, framing, end));
      expect(messages).toStrictEqual(batchList.flat().map(({ text }) => text));
      const expectedCodes = framing === "mllp" ? ["MLLP_FRAMING_REMOVED"] : [];
      expect(new Set(issues.map(({ code }) => code))).toStrictEqual(
        new Set(batchList.flat().length === 0 ? [] : expectedCodes),
      );
    },
  );

  const hostileCharacter = fc.constantFrom(
    ...Array.from("MSHFBTP|^~\\&#123 \t\r\n\u000B\u001C﻿"),
  );
  const hostileInput = fc.oneof(
    fc.string({ unit: hostileCharacter }),
    fc.string({ unit: "binary" }),
    fc
      .array(
        fc.constantFrom(
          "MSH|",
          "BTS|",
          "FTS|",
          "BHS|",
          "FHS|",
          "PID|",
          "\r",
          "\u000B",
          "\u001C\r",
          "7",
        ),
        { maxLength: 40 },
      )
      .map((parts) => parts.join("")),
  );

  propertyTest.prop([hostileInput], { numRuns: 1000 })(
    "never throws, returns only slices that start with MSH, and locates issues in the input",
    (input) => {
      const { messages, issues } = splitBatch(input);
      let searchFrom = 0;
      for (const message of messages) {
        expect(message.startsWith("MSH")).toBe(true);
        const found = input.indexOf(message, searchFrom);
        expect(found).toBeGreaterThanOrEqual(searchFrom);
        searchFrom = found + message.length;
      }
      for (const { location } of issues) {
        expect(location.span.start).toBeGreaterThanOrEqual(0);
        expect(location.span.start).toBeLessThanOrEqual(location.span.end);
        expect(location.span.end).toBeLessThanOrEqual(input.length);
      }
    },
  );
});
