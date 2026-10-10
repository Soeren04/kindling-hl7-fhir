// HD (hierarchic designator) to the system URI of an identifier: the assigning authority of CX.4, XCN.9 and EI.
//
// The guide takes HD.1, the namespace ID, as the URI, and HD.2, the universal ID, only when HD.1 is not valued. A
// namespace ID is a local name such as `HOSP`, though, and a system that is no URI would make the identifier invalid,
// so the mapper follows the guide only where it can: the caller's `identifierSystems` option is consulted first, by
// HD.1 and then by HD.2, because the caller knows the URI that the receiver uses for the authority; else the universal
// ID gives the system by its type, an ISO OID (HD.3 `ISO`) as `urn:oid:`, a UUID (HD.3 `UUID`) as `urn:uuid:` and a URI
// (HD.3 `URI`) as itself. An authority that is named and gives no system is reported (`UNKNOWN_IDENTIFIER_SYSTEM`); an
// identifier without any authority has no system to report.
import type { Location } from "../../shared/issue";
import { type MappingContext, reportIssue, textAt } from "../context";
import type { MappingCitation } from "../mapping-guide";
import type { Source } from "../source";

/** The guide's map for HD as a URI: the universal ID by its type; HD.1 serves as the key of the option instead. */
export const hdCitation: MappingCitation = {
  conceptMap: "datatype-hd-to-uri",
  rows: ["HD.1", "HD.2"],
};

/** The parts of an assigning authority, wherever they sit (an HD, or EI.2 to EI.4). */
export interface AssigningAuthority {
  readonly namespaceId?: string | undefined;
  readonly universalId?: string | undefined;
  readonly universalIdType?: string | undefined;
  /** Where the authority is, for the issue when it has no known system. */
  readonly location: Location;
}

/** An object identifier as FHIR's `oid` type allows it, without the `urn:oid:` prefix. */
const oid = /^[0-2](?:\.(?:0|[1-9]\d*))+$/u;

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

/** An absolute URI: a scheme, a colon and no whitespace. */
const absoluteUri = /^[a-z][\d+.a-z-]*:\S+$/iu;

/**
 * The assigning authority that the three parts from `firstPart` on hold, HD.1 to HD.3 of an HD (the default) or
 * EI.2 to EI.4 of an EI (`firstPart` 2); `undefined` when HD.1 and HD.2 are both empty.
 */
export function readHd(
  context: MappingContext,
  source: Source | undefined,
  firstPart = 1,
): AssigningAuthority | undefined {
  if (source === undefined) return undefined;
  const [namespaceId, universalId, universalIdType] = [0, 1, 2].map((offset) =>
    textAt(context, source, firstPart + offset),
  );
  if (namespaceId === undefined && universalId === undefined) return undefined;
  return {
    namespaceId,
    universalId,
    universalIdType,
    location: source.location,
  };
}

/**
 * The system URI of identifiers an authority assigns, by the rules at the top of this module; `undefined` when there
 * is no authority, or, reported as `UNKNOWN_IDENTIFIER_SYSTEM`, when it gives no system.
 */
export function identifierSystem(
  context: MappingContext,
  authority: AssigningAuthority | undefined,
): string | undefined {
  if (authority === undefined) return undefined;
  const system = systemOf(context, authority);
  if (system === undefined) {
    reportIssue(
      context,
      "UNKNOWN_IDENTIFIER_SYSTEM",
      authority.location,
      authority.namespaceId ?? authority.universalId,
    );
  }
  return system;
}

function systemOf(
  context: MappingContext,
  { namespaceId, universalId, universalIdType }: AssigningAuthority,
): string | undefined {
  const lookup = context.identifierSystems;
  const configured =
    (namespaceId === undefined ? undefined : lookup.get(namespaceId)) ??
    (universalId === undefined ? undefined : lookup.get(universalId));
  if (configured !== undefined || universalId === undefined) return configured;
  if (universalIdType === "ISO" && oid.test(universalId)) {
    return `urn:oid:${universalId}`;
  }
  if (universalIdType === "UUID" && uuid.test(universalId)) {
    return `urn:uuid:${universalId.toLowerCase()}`;
  }
  return universalIdType === "URI" && absoluteUri.test(universalId)
    ? universalId
    : undefined;
}
