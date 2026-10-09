import { table0001 } from "./tables/table-0001";
import { table0003 } from "./tables/table-0003";
import { table0004 } from "./tables/table-0004";
import { table0076 } from "./tables/table-0076";
import { table0085 } from "./tables/table-0085";
import { table0104 } from "./tables/table-0104";
import { table0123 } from "./tables/table-0123";
import { table0203 } from "./tables/table-0203";
import { table0354 } from "./tables/table-0354";
import type { CodeTable } from "./types";

/**
 * The HL7 tables the library validates, keyed by four-digit number (for example `0203`). Each table says whether
 * HL7 or the implementing site decides its codes.
 *
 * @example
 * ```ts
 * const sex = codeTables.get("0001");
 * console.log(sex?.kind, sex?.codes.has("F")); // "user-defined" true
 * ```
 */
export const codeTables: ReadonlyMap<string, CodeTable> = new Map(
  [
    table0001,
    table0003,
    table0004,
    table0076,
    table0085,
    table0104,
    table0123,
    table0203,
    table0354,
  ].map((table) => [table.number, table]),
);
