// Runs in a worker thread (see scaling.ts): times an operation of the library on inputs of two sizes.
//
// The worker is a separate thread so that a quadratic regression, which would block the thread for minutes, can be
// terminated by the test that started it instead of hanging the test run. Node strips the types of this file and of
// the library sources; the hook below teaches it the extensionless imports of the sources, which a bundler would
// resolve.
import { registerHooks } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

import type { ScalingTask, ScalingTimes } from "./scaling";

const extensions = [".ts", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      for (const extension of extensions) {
        try {
          return nextResolve(`${specifier}${extension}`, context);
        } catch {
          // Try the next candidate; the original error is rethrown when none exists.
        }
      }
      throw error;
    }
  },
});

const { parse, splitBatch, stringify } = await import("../../src/hl7v2");

/** Builds an input of about `bytes` characters: the prefix once, then the unit repeated. */
function inputOf(task: ScalingTask, bytes: number): string {
  return task.prefix + task.unit.repeat(Math.ceil(bytes / task.unit.length));
}

/** Prepares the operation for an input and returns the part that is timed. */
function operation(task: ScalingTask, input: string): () => unknown {
  switch (task.operation) {
    case "parse":
      return () => parse(input);
    case "splitBatch":
      return () => splitBatch(input);
    case "stringify": {
      const result = parse(input);
      if (!result.ok)
        throw new Error("the input of a stringify task must parse");
      return () => stringify(result.value.message);
    }
  }
}

/** The fastest of a few runs of an operation on an input of `bytes` characters; noise only makes a run slower. */
function fastest(task: ScalingTask, bytes: number): number {
  const run = operation(task, inputOf(task, bytes));
  run();
  let best = Infinity;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

const task = workerData as ScalingTask;

// Inputs that are cheap to process need more characters before a run is long enough to measure reliably.
const longEnough = 10;
const largestSmallInput = 256 * task.bytes;
let bytes = task.bytes;
let small = fastest(task, bytes);
while (small < longEnough && bytes < largestSmallInput) {
  bytes *= 2;
  small = fastest(task, bytes);
}
const times: ScalingTimes = { small, large: fastest(task, bytes * 4) };
parentPort?.postMessage(times);
