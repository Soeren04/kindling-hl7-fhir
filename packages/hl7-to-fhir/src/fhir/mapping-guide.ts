// The source of record of every mapping: one release of the HL7 Version 2 to FHIR Implementation Guide (CC0-1.0),
// published on npm as hl7.fhir.uv.v2mappings. Each mapper names the ConceptMap of the guide it follows and the source
// rows it implements, so the citations can be checked against the guide and listed in the documentation.

/** The release of the HL7 Version 2 to FHIR Implementation Guide the mappings follow. */
export const mappingGuide = {
  title: "HL7 Version 2 to FHIR",
  version: "1.0.0",
  url: "https://hl7.org/fhir/uv/v2mappings/STU1/",
} as const;

/** Which ConceptMap of the guide a mapper follows and which of its source rows it implements. */
export interface MappingCitation {
  /** The id of the ConceptMap, such as `datatype-cx-to-identifier` (`http://hl7.org/fhir/uv/v2mappings/ConceptMap/<id>`). */
  readonly conceptMap: string;
  /** The source elements of the map the mapper implements, as the map writes them (`CX.1`); others are not mapped. */
  readonly rows: readonly string[];
}
