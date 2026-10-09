import { Worker } from "node:worker_threads";

/** What a scaling worker is asked to time. */
export interface ScalingTask {
  readonly operation: "parse" | "splitBatch" | "stringify";
  /** Text at the start of every input, such as the MSH segment. */
  readonly prefix: string;
  /** Text that is repeated to make the input grow. */
  readonly unit: string;
  /**
   * The characters of the first small input. The worker doubles it until a run takes long enough to measure; the
   * large input has four times as many characters as the small one it ends with.
   */
  readonly bytes: number;
}

/** Milliseconds for the operation on the small input and on the input four times its size. */
export interface ScalingTimes {
  readonly small: number;
  readonly large: number;
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
 * @returns The times; rejects when the worker fails or exceeds the timeout.
 */
export function measureScaling(
  task: ScalingTask,
  timeoutMs: number,
): Promise<ScalingTimes> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("scaling-worker.ts", import.meta.url), {
      workerData: task,
      // A tree smaller than the young generation is never promoted to the old generation, which makes it much cheaper
      // per byte than a large one. A tiny young generation puts every input in the same regime, so the ratio between
      // two sizes measures the algorithm instead of the garbage collector.
      resourceLimits: { maxYoungGenerationSizeMb: 2 },
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
  });
}
