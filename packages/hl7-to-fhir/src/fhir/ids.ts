// The ids behind the `urn:uuid:` fullUrls of a bundle. By default every id is random, so two conversions of the same
// message never claim to be the same resource; tests and documentation inject `sequentialIds` to get the same bundle
// every time (ADR 0018).
import { type HookFailure, runHook } from "./hooks";
import { segmentLocation, type SegmentAt } from "./resources/segment";

/**
 * Makes the id of each resource of a bundle: a UUID, new within the conversion. `urn:uuid:` fullUrls require it in
 * lowercase, so upper-case letters are lowered.
 *
 * It is called once per resource, in bundle order, with the 0-based position of the resource in the bundle, so a
 * generator can derive the id from the position and needs no state of its own.
 *
 * @example
 * ```ts
 * import { convert, type IdGenerator } from "hl7-to-fhir";
 *
 * const fixed: IdGenerator = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345", { ids: fixed });
 * if (result.ok) result.value.bundle.entry?.[0]?.fullUrl; // => "urn:uuid:00000000-0000-4000-8000-000000000000"
 * ```
 */
export type IdGenerator = (index: number) => string;

/** A UUID in the form `urn:uuid:` fullUrls require: lowercase hexadecimal digits in groups of 8, 4, 4, 4 and 12. */
const lowercaseUuid =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

/** Whether `id` is a UUID in lowercase. */
export function isUuid(id: string): boolean {
  return lowercaseUuid.test(id);
}

/** The part of the Web Crypto API the default ids use, present in browsers and Node since version 19. */
interface RandomSource {
  readonly randomUUID?: (() => string) | undefined;
  readonly getRandomValues: <T extends Uint8Array>(array: T) => T;
}

/**
 * A random version 4 UUID: from `crypto.randomUUID` where it exists, else built from `crypto.getRandomValues`, which
 * browsers also offer on pages served over plain HTTP, where `randomUUID` is missing.
 */
export function randomId(): string {
  // The library is compiled without DOM or Node types (ADR 0002), so the global is typed here.
  const { crypto } = globalThis as unknown as { readonly crypto: RandomSource };
  if (crypto.randomUUID !== undefined) return crypto.randomUUID();
  // RFC 9562: the version (4) in the high nibble of byte 6, the variant (10) in the high bits of byte 8.
  const bytes = crypto
    .getRandomValues(new Uint8Array(16))
    .map((byte, index) =>
      index === 6
        ? (byte & 0x0f) | 0x40
        : index === 8
          ? (byte & 0x3f) | 0x80
          : byte,
    );
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10, 16),
  ]
    .map((group) => group.join(""))
    .join("-");
}

/**
 * Makes ids that depend only on `prefix` and the position of the resource in the bundle, so the same message always
 * converts to the same bundle: for tests, golden files and documentation. Different prefixes give different ids.
 *
 * Do not use them for data that leaves your tests: every conversion with the same prefix reuses the same ids, so
 * resources of different messages would claim to be the same.
 *
 * @param prefix - Any text that tells the ids of one test or document apart from another's.
 * @returns A generator for the `ids` option.
 *
 * @example
 * ```ts
 * import { convert, sequentialIds } from "hl7-to-fhir";
 *
 * const result = convert("MSH|^~\\&|LAB|HOSP|||20240115103000+0100||ADT^A01|1|P|2.5.1\rPID|1||12345", {
 *   ids: sequentialIds("docs"),
 * });
 * if (result.ok) result.value.bundle.entry?.[0]?.fullUrl; // => "urn:uuid:28eb34d2-0000-4000-8000-000000000001"
 * ```
 */
export function sequentialIds(prefix: string): IdGenerator {
  const namespace = fnv1a(prefix).toString(16).padStart(8, "0");
  return (index) =>
    `${namespace}-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`;
}

/** The fullUrls of one conversion, and the failure of the id generator, if it failed. */
export interface UrlSource {
  /** The fullUrl of the next resource, which comes from the segment `source`. */
  readonly next: (source: SegmentAt) => string;
  /** Why the id generator failed: it threw, or returned something other than a new UUID. */
  readonly failure: () => HookFailure | undefined;
}

/** Stands in for the fullUrls after the generator failed; the conversion fails, so it never reaches a bundle. */
const unusedUrl = "urn:uuid:00000000-0000-0000-0000-000000000000";

/**
 * The fullUrls of one conversion from the caller's id generator, called with the position of each resource in the
 * bundle. Once the generator fails, it is not called again.
 */
export function createUrlSource(
  generate: (index: number) => unknown,
): UrlSource {
  const used = new Set<string>();
  let failure: HookFailure | undefined;
  const next = (source: SegmentAt): string => {
    const index = used.size;
    if (failure !== undefined) return unusedUrl;
    const location = segmentLocation(source);
    const generated = runHook("ids", location, () => generate(index));
    if (!generated.ok) {
      failure = generated.error;
      return unusedUrl;
    }
    const id =
      typeof generated.value === "string"
        ? generated.value.toLowerCase()
        : generated.value;
    if (typeof id !== "string" || !isUuid(id) || used.has(id)) {
      const cause = new TypeError(
        "The ids option must return a UUID, hexadecimal digits in groups of 8, 4, 4, 4 and 12 such as 6f1c2e3a-0b4d-4e5f-8a6b-7c8d9e0f1a2b, and a new one for every resource of the conversion.",
      );
      failure = { hook: "ids", location, cause };
      return unusedUrl;
    }
    used.add(id);
    return `urn:uuid:${id}`;
  };
  return { next, failure: () => failure };
}

/** The 32-bit FNV-1a hash of the UTF-16 code units of `text`: small, stable and well spread for short texts. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
