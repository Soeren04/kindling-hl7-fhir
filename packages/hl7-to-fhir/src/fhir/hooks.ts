// The caller's code that runs during a conversion: segment mappers, customizers and the id generator. A hook that
// throws, or returns something that is not what it promised, must not break the promise that conversion never throws,
// so every call goes through `runHook`, which turns the failure into data (ADR 0019).
import type { Location } from "../shared/issue";
import { err, ok, type Result } from "../shared/result";

/** A hook that failed: which one, where in the message it was called for, and what it threw. */
export interface HookFailure {
  /** The option the hook was passed in, such as `customize.Patient`, `segmentMappers.ZPI` or `ids`. */
  readonly hook: string;
  /** The segment the hook was called for. */
  readonly location: Location;
  /** What the hook threw, or a `TypeError` describing what it returned instead of what it must. */
  readonly cause: unknown;
}

/**
 * Calls a hook and returns what it returned, or the failure when it throws.
 *
 * @param hook - The option the hook was passed in, for the failure.
 * @param location - The segment the hook is called for, for the failure.
 */
export function runHook<T>(
  hook: string,
  location: Location,
  call: () => T,
): Result<T, HookFailure> {
  try {
    return ok(call());
  } catch (cause) {
    return err({ hook, location, cause });
  }
}
