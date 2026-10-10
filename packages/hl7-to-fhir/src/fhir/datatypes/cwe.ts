// CWE and CE (coded values) to CodeableConcept. Version 2.5.1 uses CE for most coded fields; the guide has a map for
// CE and one for CWE, and CE is the first six components of CWE, so one mapper serves both.
//
// The identifier, text and coding system (components 1 to 3, with the version in 7) are the first coding, the
// alternate triplet (4 to 6, version in 8) the second, and the original text (9) the text. The name of a coding system
// is looked up in the `codeSystems` option first, then in table 0396; a code without a coding system belongs to the
// HL7 table of its field when the caller names one, else it has no system, which is not reported because the sender
// gave none. A coding whose named system stays unknown keeps its code, without system, and is reported. A text without
// a code in the first triplet (`^Free text`) becomes the text of the concept, unless the original text (9) says it.
import type { CodeableConcept, Coding } from "fhir/r4";

import { compact } from "../compact";
import {
  type MappingContext,
  present,
  reportIssue,
  text,
  textAt,
} from "../context";
import type { MappingCitation } from "../mapping-guide";
import { part, type Source } from "../source";
import { codingSystemUri, v2TableSystem } from "../terminology/coding-systems";

/** The guide's maps for CWE and CE; CWE.10 to CWE.13 do not exist in version 2.5.1. */
export const cweCitations: readonly MappingCitation[] = [
  {
    conceptMap: "datatype-cwe-to-codeableconcept",
    rows: [
      "CWE.1",
      "CWE.2",
      "CWE.3",
      "CWE.4",
      "CWE.5",
      "CWE.6",
      "CWE.7",
      "CWE.8",
      "CWE.9",
    ],
  },
  {
    conceptMap: "datatype-ce-to-codeableconcept",
    rows: ["CE.1", "CE.2", "CE.3", "CE.4", "CE.5", "CE.6"],
  },
];

/** The components of one coding of a CWE: code, display, coding system and version. */
const primary = [1, 2, 3, 7] as const;
const alternate = [4, 5, 6, 8] as const;
const originalText = 9;

/**
 * Maps a CWE or CE to a CodeableConcept; `undefined` when it holds neither a code nor a text.
 *
 * @param table - The HL7 table of the field (`"0203"`), whose THO code system a code without coding system belongs to.
 */
export function mapCwe(
  context: MappingContext,
  source: Source | undefined,
  table?: string,
): CodeableConcept | undefined {
  const cwe = present(context, source);
  if (cwe === undefined) return undefined;
  const first = coding(context, cwe, primary, table);
  const codings = [first, coding(context, cwe, alternate, undefined)].filter(
    (found) => found !== undefined,
  );
  // A text without a code is the only description of the concept, so it becomes its text.
  const description =
    textAt(context, cwe, originalText) ??
    (first === undefined ? textAt(context, cwe, primary[1]) : undefined);
  if (codings.length === 0 && description === undefined) return undefined;
  return compact({
    coding: codings.length === 0 ? undefined : codings,
    text: description,
  });
}

/** The coding of one triplet; `undefined` without a code. */
function coding(
  context: MappingContext,
  source: Source,
  [codeAt, displayAt, systemAt, versionAt]: typeof primary | typeof alternate,
  table: string | undefined,
): Coding | undefined {
  const code = textAt(context, source, codeAt);
  if (code === undefined) return undefined;
  return compact({
    system: codingSystem(context, part(source, systemAt), table),
    version: textAt(context, source, versionAt),
    code,
    display: textAt(context, source, displayAt),
  });
}

/** The URI of a coding system name, by the rules at the top of this module; reports a name that stays unknown. */
function codingSystem(
  context: MappingContext,
  source: Source | undefined,
  table: string | undefined,
): string | undefined {
  const name = text(context, source);
  if (source === undefined || name === undefined) {
    return table === undefined ? undefined : v2TableSystem(table);
  }
  const system = context.codeSystems.get(name) ?? codingSystemUri(name);
  if (system === undefined) {
    reportIssue(context, "UNKNOWN_CODE_SYSTEM", source.location, name);
  }
  return system;
}
