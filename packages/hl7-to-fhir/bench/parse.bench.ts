// Throughput of the parser and the batch splitter. Run with `pnpm bench`; the numbers are in bench/README.md.
import { describe, test } from "vitest";

import { parse, splitBatch } from "../dist/hl7v2.js";
import {
  adtA01,
  batchOfOneMegabyte,
  emptyNodesOfOneMegabyte,
  escapedFieldOfOneMegabyte,
  manyNodesOfOneMegabyte,
  oruOfOneMegabyte,
  oruR01With50Obx,
  plainFieldOfOneMegabyte,
} from "./inputs";

describe("parse: typical messages", () => {
  test("ADT^A01 (6 segments)", async ({ bench }) => {
    await bench("parse ADT^A01", () => void parse(adtA01)).run();
  });

  test("ORU^R01 with 50 OBX", async ({ bench }) => {
    await bench(
      "parse ORU^R01 with 50 OBX",
      () => void parse(oruR01With50Obx),
    ).run();
  });
});

// Each of these inputs is about 1 MB. They bound the cost per byte from both sides: plain text allocates one node,
// subcomponents allocate a node per one or two bytes.
describe("parse: 1 MB", () => {
  // One iteration takes tens of milliseconds, so the default of 64 iterations would take minutes per input.
  const largeInput = { time: 500, iterations: 10 };
  const inputs: readonly (readonly [string, string])[] = [
    ["many OBX segments", oruOfOneMegabyte],
    ["plain text field", plainFieldOfOneMegabyte],
    ["escape sequences in a field", escapedFieldOfOneMegabyte],
    [
      "one-character subcomponents in a field (worst case)",
      manyNodesOfOneMegabyte,
    ],
    ["empty subcomponents in a field", emptyNodesOfOneMegabyte],
  ];

  for (const [name, input] of inputs) {
    test(name, async ({ bench }) => {
      await bench(`parse 1 MB: ${name}`, () => void parse(input)).run(
        largeInput,
      );
    });
  }
});

describe("splitBatch", () => {
  test("batch of ADT^A01 messages, 1 MB", async ({ bench }) => {
    await bench(
      "splitBatch 1 MB",
      () => void splitBatch(batchOfOneMegabyte),
    ).run({ time: 500, iterations: 10 });
  });
});
