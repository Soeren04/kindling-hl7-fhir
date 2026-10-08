/**
 * The successful outcome of an operation that can fail in an expected way.
 *
 * @typeParam T - The type of the produced value.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * The failed outcome of an operation that can fail in an expected way.
 *
 * @typeParam E - The type describing why the operation failed.
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The outcome of an operation that can fail in an expected way: either {@link Ok} or {@link Err}.
 *
 * Expected failures are returned instead of thrown, so callers see them in the type and handle them by
 * checking the `ok` discriminant.
 *
 * @typeParam T - The type of the produced value.
 * @typeParam E - The type describing why the operation failed.
 *
 * @example
 * ```ts
 * import type { Result } from "hl7-to-fhir";
 *
 * declare const result: Result<number, "EMPTY">;
 * if (result.ok) console.log(result.value + 1);
 * else console.error(result.error);
 * ```
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a value in a successful {@link Result}.
 *
 * @param value - The produced value.
 * @returns A successful result holding `value`.
 *
 * @example
 * ```ts
 * const result = ok(42); // { ok: true, value: 42 }
 * ```
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error description in a failed {@link Result}.
 *
 * @param error - Why the operation failed.
 * @returns A failed result holding `error`.
 *
 * @example
 * ```ts
 * const result = err({ code: "EMPTY_INPUT" }); // { ok: false, error: { code: "EMPTY_INPUT" } }
 * ```
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
