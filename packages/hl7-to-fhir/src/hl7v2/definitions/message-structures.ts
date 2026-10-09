import { adtA01 } from "./structures/adt-a01";
import { oruR01 } from "./structures/oru-r01";
import type { MessageStructureDefinition } from "./types";

/**
 * The message structures the library knows, keyed by identifier (for example `ORU_R01`).
 *
 * @example
 * ```ts
 * const oru = messageStructures.get("ORU_R01");
 * console.log(oru?.elements.map((element) => element.kind));
 * ```
 */
export const messageStructures: ReadonlyMap<
  string,
  MessageStructureDefinition
> = new Map([adtA01, oruR01].map((structure) => [structure.id, structure]));
