/**
 * An object type whose properties that may be `undefined` may instead be left out and, where present, are never
 * `undefined`; the other properties stay required.
 */
export type Compact<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

/**
 * The properties of `object` whose value is not `undefined`. FHIR JSON leaves absent elements out, and a property set
 * to `undefined` would survive `structuredClone` and `toStrictEqual` as present.
 *
 * @example
 * ```ts
 * compact({ system: "phone", value: undefined }); // { system: "phone" }
 * ```
 */
export function compact<T extends object>(object: T): Compact<T> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as Compact<T>;
}

/**
 * The elements of `array`, or `undefined` when it has none: FHIR JSON has no empty arrays, so a list element without
 * items is left out.
 *
 * @example
 * ```ts
 * compact({ telecom: nonEmpty([]) }); // {}
 * ```
 */
export function nonEmpty<T>(array: readonly T[]): T[] | undefined {
  return array.length === 0 ? undefined : [...array];
}
