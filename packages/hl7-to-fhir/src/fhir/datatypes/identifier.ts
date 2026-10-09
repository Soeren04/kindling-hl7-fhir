// What CX, XCN and EI have in common: an identifier value, an assigning authority that gives its system, and an
// identifier type code from HL7 table 0203.
import type { CodeableConcept, Identifier, Period } from "fhir/r4";

import { table0203 } from "../../hl7v2/definitions/tables/table-0203";
import { compact } from "../compact";
import type { MappingContext } from "../context";
import type { Source } from "../source";
import { v2TableSystem } from "../terminology/coding-systems";
import { mapCode } from "./code";
import { type AssigningAuthority, identifierSystem } from "./hd";

/** The parts of an identifier before its system is resolved. */
export interface IdentifierParts {
  readonly value: string;
  readonly authority: AssigningAuthority | undefined;
  readonly type?: CodeableConcept | undefined;
  readonly period?: Period | undefined;
}

/**
 * The FHIR identifier of the parts. Without a known system, the authority's name is kept as the display of the
 * assigner, so it is not lost.
 */
export function buildIdentifier(
  context: MappingContext,
  { value, authority, type, period }: IdentifierParts,
): Identifier {
  const system = identifierSystem(context, authority);
  const assigner =
    system === undefined
      ? (authority?.namespaceId ?? authority?.universalId)
      : undefined;
  return compact({
    type,
    system,
    value,
    period,
    assigner: assigner === undefined ? undefined : { display: assigner },
  });
}

/**
 * The identifier type of a table 0203 code (CX.5, XCN.13) as a coding of the THO code system v2-0203, which the
 * guide's ConceptMap `table-hl70203-to-v2-0203` maps one to one. A code the table does not have is kept as text and
 * reported as `UNMAPPED_CODE`.
 */
export function identifierType(
  context: MappingContext,
  source: Source | undefined,
): CodeableConcept | undefined {
  return mapCode<CodeableConcept>(
    context,
    source,
    (code) =>
      table0203.codes.has(code)
        ? { coding: [{ system: v2TableSystem(table0203.number), code }] }
        : undefined,
    { kept: (code) => ({ text: code }) },
  );
}
