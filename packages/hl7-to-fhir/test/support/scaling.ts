import { Worker } from "node:worker_threads";

/** What a scaling worker is asked to time. */
export interface ScalingTask {
  readonly operation: "parse" | "splitBatch" | "stringify";
  /** Text at the start of every input, such as the MSH segment. */
  readonly prefix: string;
  /** Text that is repeated to make the input grow. */
  readonly unit: string;
  /** Text at the end of every input, so that the repeated unit is not trailing whitespace the parser trims. */
  readonly suffix: string;
  /**
   * The characters of the first small input. The worker doubles it until a run takes at least `minimumMilliseconds`;
   * the large input has about four times as many characters as the small one it ends with.
   */
  readonly bytes: number;
  /** How long a run on the small input takes at least, so that clock and scheduling noise cannot hide growth. */
  readonly minimumMilliseconds: number;
}

/** Milliseconds for the operation on the small input and on a larger one, with the characters of both. */
export interface ScalingTimes {
  readonly small: number;
  readonly smallLength: number;
  readonly large: number;
  readonly largeLength: number;
}

/**
 * Times an operation on an input and on one four times as large, in a worker thread.
 *
 * A linear operation takes about four times as long on the large input, a quadratic one sixteen times as long. A
 * quadratic regression on a megabyte takes minutes and would block a test run, so the worker is terminated when it
 * does not answer in time.
 *
 * @param task - The operation and the input to time.
 * @param timeoutMs - How long the worker may take in total.
 * @param script - The worker to run; the tests replace it to see how a worker that dies is handled.
 * @returns The times; rejects when the worker fails, exits without answering or exceeds the timeout.
 */
export function measureScaling(
  task: ScalingTask,
  timeoutMs: number,
  script: URL = new URL("scaling-worker.ts", import.meta.url),
): Promise<ScalingTimes> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, {
      workerData: task,
      // A tree smaller than the young generation is never promoted to the old generation, which makes it much cheaper
      // per byte than a large one. A tiny young generation puts every input in the same regime, so the ratio between
      // two sizes measures the algorithm instead of the garbage collector.
      // The old generation is capped so that a regression that makes the tree grow without bound ends this worker with
      // an error, instead of taking the memory of the machine the tests run on.
      resourceLimits: {
        maxYoungGenerationSizeMb: 2,
        maxOldGenerationSizeMb: 1024,
      },
    });
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${task.operation} on ${JSON.stringify(task.unit)} did not finish within ${String(timeoutMs)} ms: its running time is probably not linear`,
        ),
      );
      void worker.terminate();
    }, timeoutMs);
    worker.once("message", (times: ScalingTimes) => {
      clearTimeout(timer);
      resolve(times);
      void worker.terminate();
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    // A worker that ends without a message or an error, for example through process.exit, would leave the promise
    // pending until the timeout; after a message or an error the promise is settled and this does nothing.
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `the ${task.operation} worker exited with code ${String(code)} before it answered`,
        ),
      );
    });
  });
}
