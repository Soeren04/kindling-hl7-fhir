import { evn } from "./segments/evn";
import { msh } from "./segments/msh";
import { nte } from "./segments/nte";
import { obr } from "./segments/obr";
import { obx } from "./segments/obx";
import { orc } from "./segments/orc";
import { pd1 } from "./segments/pd1";
import { pid } from "./segments/pid";
import { pv1 } from "./segments/pv1";
import { pv2 } from "./segments/pv2";
import type { SegmentDefinition } from "./types";

/**
 * The segments the library validates and maps, keyed by identifier (for example `PID`). Other segments of a
 * message structure are known by their identifier only.
 *
 * @example
 * ```ts
 * const patientName = segmentDefinitions.get("PID")?.fields[4];
 * console.log(patientName?.name, patientName?.dataType); // "patientName" "XPN"
 * ```
 */
export const segmentDefinitions: ReadonlyMap<string, SegmentDefinition> =
  new Map(
    [msh, evn, pid, pd1, pv1, pv2, orc, obr, obx, nte].map((definition) => [
      definition.id,
      definition,
    ]),
  );
