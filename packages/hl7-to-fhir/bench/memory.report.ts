// Prints what a parsed message costs in time and memory. Run with `pnpm bench:memory`; the numbers are in
// bench/README.md. It is a report, not a test: it asserts only that the measurement could be made.
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { expect, it } from "vitest";

import { type Hl7Message, parse } from "hl7-to-fhir/hl7v2";
import {
  adtA01,
  emptyNodesOfOneMegabyte,
  escapedFieldOfOneMegabyte,
  manyFieldsOfOneMegabyte,
  manyNodesOfOneMegabyte,
  oruOfOneMegabyte,
  oruR01With50Obx,
  plainFieldOfOneMegabyte,
} from "./inputs";

setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

function heapUsed(): number {
  collectGarbage();
  collectGarbage();
  return process.memoryUsage().heapUsed;
}

/** The number of nodes of the tree, spans included: one object per node and one per span. */
function countNodes(message: Hl7Message): number {
  let nodes = 0;
  for (const segment of message.segments) {
    nodes += 2;
    for (const field of segment.fields) {
      nodes += 2;
      for (const repetition of field.repetitions) {
        nodes += 2;
        for (const component of repetition.components) {
          nodes += 2 + 2 * component.subcomponents.length;
        }
      }
    }
  }
  return nodes;
}

const cases: readonly (readonly [string, string])[] = [
  ["ADT^A01", adtA01],
  ["ORU^R01, 50 OBX", oruR01With50Obx],
  ["ORU^R01, 1 MB of OBX", oruOfOneMegabyte],
  ["1 MB plain text field", plainFieldOfOneMegabyte],
  ["1 MB escape sequences", escapedFieldOfOneMegabyte],
  ["1 MB one-character subcomponents", manyNodesOfOneMegabyte],
  ["1 MB empty subcomponents", emptyNodesOfOneMegabyte],
  ["1 MB of 500,000 fields", manyFieldsOfOneMegabyte],
];

/** The heap a parsed message retains, measured after garbage collection, and the size of its tree. */
function measure(input: string): { retained: number; objects: number } {
  const before = heapUsed();
  const result = parse(input);
  const after = heapUsed();
  if (!result.ok) throw new Error("the benchmark input does not parse");
  return {
    retained: after - before,
    objects: countNodes(result.value.message),
  };
}

it("reports the memory a parsed message retains", () => {
  const rows = cases.map(([name, input]) => {
    const { retained, objects } = measure(input);
    return {
      input: name,
      "input KB": (input.length / 1000).toFixed(1),
      "retained KB": (retained / 1000).toFixed(0),
      "retained / input": (retained / input.length).toFixed(1),
      "tree objects": String(objects),
      "bytes / object": (retained / objects).toFixed(0),
    };
  });
  expect(rows).toHaveLength(cases.length);
  console.table(rows);
});
