import { describe, expect, it } from "vitest";

import { measureScaling, type ScalingTask } from "./scaling";

const task: ScalingTask = {
  operation: "parse",
  prefix: "MSH|^~\\&|A\r",
  unit: "NTE\r",
  suffix: "",
  bytes: 10_000,
  minimumMilliseconds: 10,
};

describe("measureScaling", () => {
  it("reports the times for the small and the large input", async () => {
    const { small, large } = await measureScaling(task, 20_000);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(0);
  });

  it("rejects when the worker does not finish in time, instead of waiting for it", async () => {
    // Starting the worker takes longer than the timeout, so nothing finishes in time.
    await expect(measureScaling(task, 1)).rejects.toThrow(
      'parse on "NTE\\r" did not finish within 1 ms: its running time is probably not linear',
    );
  });

  it("rejects at once when the worker exits without answering", async () => {
    const started = performance.now();
    await expect(
      measureScaling(
        task,
        60_000,
        new URL("exiting-worker.ts", import.meta.url),
      ),
    ).rejects.toThrow("the parse worker exited with code 3 before it answered");
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it("rejects when the worker fails", async () => {
    // Without an MSH segment the input cannot be parsed, which stringify needs.
    await expect(
      measureScaling({ ...task, operation: "stringify", prefix: "" }, 20_000),
    ).rejects.toThrow("must parse");
  });
});
