// Data types of the segments in ./segments, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR Implementation Guide 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at
// commit 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Component identifiers, names and data types come from the data
// type maps in mappings/datatypes/ ("HL7 Data Type - FHIR R4_ <TYPE>[...] - Sheet1.csv" for XPN, CX, XAD, XTN, CWE,
// CE, CNE, HD, PL, XCN, TS, DTM, EI, EIP, MSG, PT, CQ, SN, XON, FN, DR, SAD, TQ, SPS, NDL, CNN, DLD and OG). Names
// are shortened to identifiers. The guide has no maps for RI, OSD, MO, MOC, PRL, FC and VID; for those the structure
// is the one HL7 v2.5.1 defines. Only identifiers, names, types and table numbers are recorded, never descriptions
// (ADR 0005).
//
// The guide's maps carry no table numbers. The table of each coded component is the one HL7 v2.5.1 assigns, checked
// against the data of HAPI hapi-structures-v251 2.5.1 and of hl7-dictionary 1.0.1 (version 2.5.1); a component
// without a table is one that 2.5.1 leaves without one.
//
// Where 2.5.1 differs from the version the guide targets (v2.9):
// - CE is used where the guide has CWE for most coded fields, IS where it has CWE for user-defined tables.
// - TS (a time and a degree of precision) is used where the guide has DTM.
// - Components added after 2.5.1 are not defined: CWE and CNE stop at component 9, CX at 10, XCN at 23, XAD and XPN
//   at 14 and XTN at 12. PL has the 11 components that 2.5.1 defines.
// - XTN.5 to XTN.8 are NM (the guide has SNM), PL.1 to PL.3 are IS (the guide has HD), and EIP is made of two EI
//   components (the guide flattens them).
// - Components carry no optionality (the guide's CX.1 and CX.5 are required); only fields do.

import { component, composite, primitive } from "./define";
import type { DataTypeDefinition } from "./types";

const primitives = ["DT", "DTM", "FT", "ID", "IS", "NM", "SI", "ST", "TX"].map(
  primitive,
);

const composites = [
  composite("CE", [
    component(1, "identifier", "ST"),
    component(2, "text", "ST"),
    component(3, "nameOfCodingSystem", "ID", "0396"),
    component(4, "alternateIdentifier", "ST"),
    component(5, "alternateText", "ST"),
    component(6, "nameOfAlternateCodingSystem", "ID", "0396"),
  ]),
  composite("CNE", [
    component(1, "identifier", "ST"),
    component(2, "text", "ST"),
    component(3, "nameOfCodingSystem", "ID", "0396"),
    component(4, "alternateIdentifier", "ST"),
    component(5, "alternateText", "ST"),
    component(6, "nameOfAlternateCodingSystem", "ID", "0396"),
    component(7, "codingSystemVersionId", "ST"),
    component(8, "alternateCodingSystemVersionId", "ST"),
    component(9, "originalText", "ST"),
  ]),
  composite("CNN", [
    component(1, "idNumber", "ST"),
    component(2, "familyName", "ST"),
    component(3, "givenName", "ST"),
    component(4, "secondAndFurtherGivenNames", "ST"),
    component(5, "suffix", "ST"),
    component(6, "prefix", "ST"),
    component(7, "degree", "IS", "0360"),
    component(8, "sourceTable", "IS", "0297"),
    component(9, "assigningAuthorityNamespaceId", "IS", "0363"),
    component(10, "assigningAuthorityUniversalId", "ST"),
    component(11, "assigningAuthorityUniversalIdType", "ID", "0301"),
  ]),
  composite("CQ", [
    component(1, "quantity", "NM"),
    component(2, "units", "CE"),
  ]),
  composite("CWE", [
    component(1, "identifier", "ST"),
    component(2, "text", "ST"),
    component(3, "nameOfCodingSystem", "ID", "0396"),
    component(4, "alternateIdentifier", "ST"),
    component(5, "alternateText", "ST"),
    component(6, "nameOfAlternateCodingSystem", "ID", "0396"),
    component(7, "codingSystemVersionId", "ST"),
    component(8, "alternateCodingSystemVersionId", "ST"),
    component(9, "originalText", "ST"),
  ]),
  composite("CX", [
    component(1, "idNumber", "ST"),
    component(2, "identifierCheckDigit", "ST"),
    component(3, "checkDigitScheme", "ID", "0061"),
    component(4, "assigningAuthority", "HD", "0363"),
    component(5, "identifierTypeCode", "ID", "0203"),
    component(6, "assigningFacility", "HD"),
    component(7, "effectiveDate", "DT"),
    component(8, "expirationDate", "DT"),
    component(9, "assigningJurisdiction", "CWE"),
    component(10, "assigningAgencyOrDepartment", "CWE"),
  ]),
  composite("DLD", [
    component(1, "dischargeToLocation", "IS", "0113"),
    component(2, "effectiveDate", "TS"),
  ]),
  composite("DR", [
    component(1, "rangeStartDateTime", "TS"),
    component(2, "rangeEndDateTime", "TS"),
  ]),
  composite("EI", [
    component(1, "entityIdentifier", "ST"),
    component(2, "namespaceId", "IS", "0363"),
    component(3, "universalId", "ST"),
    component(4, "universalIdType", "ID", "0301"),
  ]),
  composite("EIP", [
    component(1, "placerAssignedIdentifier", "EI"),
    component(2, "fillerAssignedIdentifier", "EI"),
  ]),
  composite("FC", [
    component(1, "financialClassCode", "IS", "0064"),
    component(2, "effectiveDate", "TS"),
  ]),
  composite("FN", [
    component(1, "surname", "ST"),
    component(2, "ownSurnamePrefix", "ST"),
    component(3, "ownSurname", "ST"),
    component(4, "surnamePrefixFromPartner", "ST"),
    component(5, "surnameFromPartner", "ST"),
  ]),
  composite("HD", [
    component(1, "namespaceId", "IS", "0300"),
    component(2, "universalId", "ST"),
    component(3, "universalIdType", "ID", "0301"),
  ]),
  composite("MO", [
    component(1, "quantity", "NM"),
    component(2, "denomination", "ID"),
  ]),
  composite("MOC", [
    component(1, "monetaryAmount", "MO"),
    component(2, "chargeCode", "CE"),
  ]),
  composite("MSG", [
    component(1, "messageCode", "ID", "0076"),
    component(2, "triggerEvent", "ID", "0003"),
    component(3, "messageStructure", "ID", "0354"),
  ]),
  composite("NDL", [
    component(1, "name", "CNN"),
    component(2, "startDateTime", "TS"),
    component(3, "endDateTime", "TS"),
    component(4, "pointOfCare", "IS", "0302"),
    component(5, "room", "IS", "0303"),
    component(6, "bed", "IS", "0304"),
    component(7, "facility", "HD"),
    component(8, "locationStatus", "IS", "0306"),
    component(9, "patientLocationType", "IS", "0305"),
    component(10, "building", "IS", "0307"),
    component(11, "floor", "IS", "0308"),
  ]),
  composite("OSD", [
    component(1, "sequenceResultsFlag", "ID", "0524"),
    component(2, "placerOrderNumberEntityIdentifier", "ST"),
    component(3, "placerOrderNumberNamespaceId", "IS", "0363"),
    component(4, "fillerOrderNumberEntityIdentifier", "ST"),
    component(5, "fillerOrderNumberNamespaceId", "IS", "0363"),
    component(6, "sequenceConditionValue", "ST"),
    component(7, "maximumNumberOfRepeats", "NM"),
    component(8, "placerOrderNumberUniversalId", "ST"),
    component(9, "placerOrderNumberUniversalIdType", "ID", "0301"),
    component(10, "fillerOrderNumberUniversalId", "ST"),
    component(11, "fillerOrderNumberUniversalIdType", "ID", "0301"),
  ]),
  composite("PL", [
    component(1, "pointOfCare", "IS", "0302"),
    component(2, "room", "IS", "0303"),
    component(3, "bed", "IS", "0304"),
    component(4, "facility", "HD"),
    component(5, "locationStatus", "IS", "0306"),
    component(6, "personLocationType", "IS", "0305"),
    component(7, "building", "IS", "0307"),
    component(8, "floor", "IS", "0308"),
    component(9, "locationDescription", "ST"),
    component(10, "comprehensiveLocationIdentifier", "EI"),
    component(11, "assigningAuthorityForLocation", "HD"),
  ]),
  composite("PRL", [
    component(1, "parentObservationIdentifier", "CE"),
    component(2, "parentObservationSubIdentifier", "ST"),
    component(3, "parentObservationValueDescriptor", "TX"),
  ]),
  composite("PT", [
    component(1, "processingId", "ID", "0103"),
    component(2, "processingMode", "ID", "0207"),
  ]),
  composite("RI", [
    component(1, "repeatPattern", "IS", "0335"),
    component(2, "explicitTimeInterval", "ST"),
  ]),
  composite("SAD", [
    component(1, "streetOrMailingAddress", "ST"),
    component(2, "streetName", "ST"),
    component(3, "dwellingNumber", "ST"),
  ]),
  composite("SN", [
    component(1, "comparator", "ST"),
    component(2, "num1", "NM"),
    component(3, "separatorSuffix", "ST"),
    component(4, "num2", "NM"),
  ]),
  composite("SPS", [
    component(1, "specimenSourceNameOrCode", "CWE"),
    component(2, "additives", "CWE", "0371"),
    component(3, "specimenCollectionMethod", "TX"),
    component(4, "bodySite", "CWE", "0163"),
    component(5, "siteModifier", "CWE", "0495"),
    component(6, "collectionMethodModifierCode", "CWE"),
    component(7, "specimenRole", "CWE", "0369"),
  ]),
  composite("TQ", [
    component(1, "quantity", "CQ"),
    component(2, "interval", "RI"),
    component(3, "duration", "ST"),
    component(4, "startDateTime", "TS"),
    component(5, "endDateTime", "TS"),
    component(6, "priority", "ST"),
    component(7, "condition", "ST"),
    component(8, "text", "TX"),
    component(9, "conjunction", "ID", "0472"),
    component(10, "orderSequencing", "OSD"),
    component(11, "occurrenceDuration", "CE"),
    component(12, "totalOccurrences", "NM"),
  ]),
  composite("TS", [
    component(1, "time", "DTM"),
    component(2, "degreeOfPrecision", "ID", "0529"),
  ]),
  composite("VID", [
    component(1, "versionId", "ID", "0104"),
    component(2, "internationalizationCode", "CE", "0399"),
    component(3, "internationalVersionId", "CE"),
  ]),
  composite("XAD", [
    component(1, "streetAddress", "SAD"),
    component(2, "otherDesignation", "ST"),
    component(3, "city", "ST"),
    component(4, "stateOrProvince", "ST"),
    component(5, "zipOrPostalCode", "ST"),
    component(6, "country", "ID", "0399"),
    component(7, "addressType", "ID", "0190"),
    component(8, "otherGeographicDesignation", "ST"),
    component(9, "countyParishCode", "IS", "0289"),
    component(10, "censusTract", "IS", "0288"),
    component(11, "addressRepresentationCode", "ID", "0465"),
    component(12, "addressValidityRange", "DR"),
    component(13, "effectiveDate", "TS"),
    component(14, "expirationDate", "TS"),
  ]),
  composite("XCN", [
    component(1, "personIdentifier", "ST"),
    component(2, "familyName", "FN"),
    component(3, "givenName", "ST"),
    component(4, "secondAndFurtherGivenNames", "ST"),
    component(5, "suffix", "ST"),
    component(6, "prefix", "ST"),
    component(7, "degree", "IS", "0360"),
    component(8, "sourceTable", "IS", "0297"),
    component(9, "assigningAuthority", "HD", "0363"),
    component(10, "nameTypeCode", "ID", "0200"),
    component(11, "identifierCheckDigit", "ST"),
    component(12, "checkDigitScheme", "ID", "0061"),
    component(13, "identifierTypeCode", "ID", "0203"),
    component(14, "assigningFacility", "HD"),
    component(15, "nameRepresentationCode", "ID", "0465"),
    component(16, "nameContext", "CE", "0448"),
    component(17, "nameValidityRange", "DR"),
    component(18, "nameAssemblyOrder", "ID", "0444"),
    component(19, "effectiveDate", "TS"),
    component(20, "expirationDate", "TS"),
    component(21, "professionalSuffix", "ST"),
    component(22, "assigningJurisdiction", "CWE"),
    component(23, "assigningAgencyOrDepartment", "CWE"),
  ]),
  composite("XON", [
    component(1, "organizationName", "ST"),
    component(2, "organizationNameTypeCode", "IS", "0204"),
    component(3, "idNumber", "NM"),
    component(4, "identifierCheckDigit", "NM"),
    component(5, "checkDigitScheme", "ID", "0061"),
    component(6, "assigningAuthority", "HD", "0363"),
    component(7, "identifierTypeCode", "ID", "0203"),
    component(8, "assigningFacility", "HD"),
    component(9, "nameRepresentationCode", "ID", "0465"),
    component(10, "organizationIdentifier", "ST"),
  ]),
  composite("XPN", [
    component(1, "familyName", "FN"),
    component(2, "givenName", "ST"),
    component(3, "secondAndFurtherGivenNames", "ST"),
    component(4, "suffix", "ST"),
    component(5, "prefix", "ST"),
    component(6, "degree", "IS", "0360"),
    component(7, "nameTypeCode", "ID", "0200"),
    component(8, "nameRepresentationCode", "ID", "0465"),
    component(9, "nameContext", "CE", "0448"),
    component(10, "nameValidityRange", "DR"),
    component(11, "nameAssemblyOrder", "ID", "0444"),
    component(12, "effectiveDate", "TS"),
    component(13, "expirationDate", "TS"),
    component(14, "professionalSuffix", "ST"),
  ]),
  composite("XTN", [
    component(1, "telephoneNumber", "ST"),
    component(2, "telecommunicationUseCode", "ID", "0201"),
    component(3, "telecommunicationEquipmentType", "ID", "0202"),
    component(4, "emailAddress", "ST"),
    component(5, "countryCode", "NM"),
    component(6, "areaCityCode", "NM"),
    component(7, "localNumber", "NM"),
    component(8, "extension", "NM"),
    component(9, "anyText", "ST"),
    component(10, "extensionPrefix", "ST"),
    component(11, "speedDialCode", "ST"),
    component(12, "unformattedTelephoneNumber", "ST"),
  ]),
];

const varies: DataTypeDefinition = { kind: "varies", id: "varies" };

/**
 * The data types used by the segments in this library, keyed by identifier (for example `XPN`). Primitive types
 * have no components; `varies` stands for a field whose type is decided by another field (OBX-5 by OBX-2).
 *
 * @example
 * ```ts
 * const xpn = dataTypes.get("XPN");
 * if (xpn?.kind === "composite") console.log(xpn.components[0]?.name); // "familyName"
 * ```
 */
export const dataTypes: ReadonlyMap<string, DataTypeDefinition> = new Map(
  [...primitives, ...composites, varies].map((type) => [type.id, type]),
);
