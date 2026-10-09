// Runs in a worker thread (see scaling.ts): times an operation of the library on inputs of two sizes.
//
// The worker is a separate thread so that a quadratic regression, which would block the thread for minutes, can be
// terminated by the test that started it instead of hanging the test run. Node strips the types of this file and of
// the library sources; the hook below teaches it the extensionless imports of the sources, which a bundler would
// resolve.
import { registerHooks } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

import type { Hl7Message } from "../../src/hl7v2";
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

const { group, parse, splitBatch, stringify, validate } =
  await import("../../src/hl7v2");

/** Builds an input of about `bytes` characters: the prefix once, then the unit repeated, then the suffix. */
function inputOf(task: ScalingTask, bytes: number): string {
  return (
    task.prefix +
    task.unit.repeat(Math.ceil(bytes / task.unit.length)) +
    task.suffix
  );
}

/** Prepares the operation for an input and returns the part that is timed. */
function operation(task: ScalingTask, input: string): () => unknown {
  switch (task.operation) {
    case "parse":
      return () => parse(input);
    case "splitBatch":
      return () => splitBatch(input);
    case "stringify": {
      const message = parsedMessage(input);
      return () => stringify(message);
    }
    case "validate": {
      const message = parsedMessage(input);
      return () => validate(message);
    }
    case "group": {
      const message = parsedMessage(input);
      return () => group(message);
    }
  }
}

/** The message of an input that operations on messages take; such an input must parse. */
function parsedMessage(input: string): Hl7Message {
  const result = parse(input);
  if (!result.ok) throw new Error("the input of a task on messages must parse");
  return result.value.message;
}

/** The fastest of two runs after a warm-up run of an operation on an input of `bytes` characters; noise only makes a run slower. */
function fastest(task: ScalingTask, bytes: number): number {
  const run = operation(task, inputOf(task, bytes));
  run();
  let best = Infinity;
  for (let attempt = 0; attempt < 2; attempt++) {
    best = Math.min(best, timed(run));
  }
  return best;
}

function timed(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

const task = workerData as ScalingTask;

// Inputs that are cheap to process need many characters before a run is long enough to measure reliably. A single
// cold run per size finds that size; only the two sizes that are compared are timed carefully.
const largestSmallInput = 1024 * task.bytes;
let bytes = task.bytes;
while (
  bytes < largestSmallInput &&
  timed(operation(task, inputOf(task, bytes))) < task.minimumMilliseconds
) {
  bytes *= 2;
}
const times: ScalingTimes = {
  small: fastest(task, bytes),
  smallLength: inputOf(task, bytes).length,
  large: fastest(task, bytes * 4),
  largeLength: inputOf(task, bytes * 4).length,
};
parentPort?.postMessage(times);
