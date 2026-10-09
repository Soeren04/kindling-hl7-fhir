/**
 * Whether `value` is a string. Callers in plain JavaScript can pass anything, so the public functions check their
 * text arguments and fail with `INVALID_INPUT` instead of throwing a `TypeError` deep inside.
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}
