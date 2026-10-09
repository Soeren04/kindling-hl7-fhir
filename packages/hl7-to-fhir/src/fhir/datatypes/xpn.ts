// XPN (extended person name) to HumanName. XPN.3 (second and further given names) stays one given name, as the guide
// leaves open whether "Mary Anne" is one name or two; the degree (XPN.6) and the professional suffix (XPN.14) follow
// the suffix (XPN.4). XPN.12 and XPN.13 give the period, or else the range of XPN.10.
import type { HumanName } from "fhir/r4";

import { compact } from "../compact";
import { type MappingContext, present, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { nameUse, nameUseUnmatched } from "../terminology/concept-maps";
import { mapCode } from "./code";
import { mapDr, mapTs, period } from "./date-time";

/** The guide's maps for XPN and FN.1, its family name. */
export const xpnCitations: readonly MappingCitation[] = [
  {
    conceptMap: "datatype-xpn-to-humanname",
    rows: [
      "XPN.1",
      "XPN.2",
      "XPN.3",
      "XPN.4",
      "XPN.5",
      "XPN.6",
      "XPN.7",
      "XPN.10",
      "XPN.12",
      "XPN.13",
      "XPN.14",
    ],
  },
  { conceptMap: "datatype-fn-to-humanname", rows: ["FN.1"] },
];

/** The parts of a person name, in the order HumanName lists them. */
export interface NameParts {
  readonly family: string | undefined;
  readonly given: readonly (string | undefined)[];
  readonly prefix: readonly (string | undefined)[];
  readonly suffix: readonly (string | undefined)[];
}

/** Maps an XPN to a HumanName; `undefined` when it holds no name part. */
export function mapXpn(
  context: MappingContext,
  source: Source | undefined,
): HumanName | undefined {
  const xpn = present(context, source);
  if (xpn === undefined) return undefined;
  const name = humanName({
    family: textAt(context, part(xpn, 1), 1),
    given: [textAt(context, xpn, 2), textAt(context, xpn, 3)],
    prefix: [textAt(context, xpn, 5)],
    suffix: [
      textAt(context, xpn, 4),
      textAt(context, xpn, 6),
      textAt(context, xpn, 14),
    ],
  });
  if (name === undefined) return undefined;
  return compact({
    use: mapCode(context, part(xpn, 7), nameUse, {
      unmatched: nameUseUnmatched,
    }),
    ...name,
    period:
      period(mapTs(context, part(xpn, 12)), mapTs(context, part(xpn, 13))) ??
      mapDr(context, part(xpn, 10)),
  });
}

/** A HumanName of the parts that are present; `undefined` when none is. */
export function humanName(parts: NameParts): HumanName | undefined {
  const given = defined(parts.given);
  const prefix = defined(parts.prefix);
  const suffix = defined(parts.suffix);
  const { family } = parts;
  if (
    family === undefined &&
    given.length + prefix.length + suffix.length === 0
  ) {
    return undefined;
  }
  return compact({
    family,
    given: given.length === 0 ? undefined : given,
    prefix: prefix.length === 0 ? undefined : prefix,
    suffix: suffix.length === 0 ? undefined : suffix,
  });
}

/** A name as one line, in the order it is spoken: prefixes, given names, family name, suffixes. */
export function formatName(name: HumanName): string {
  return [
    ...(name.prefix ?? []),
    ...(name.given ?? []),
    ...(name.family === undefined ? [] : [name.family]),
    ...(name.suffix ?? []),
  ].join(" ");
}

function defined(texts: readonly (string | undefined)[]): string[] {
  return texts.filter((piece) => piece !== undefined);
}
