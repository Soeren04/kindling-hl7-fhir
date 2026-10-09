// MSH, the message header, as of HL7 v2.5.1.
//
// Source of record: HL7 Version 2 to FHIR IG 1.0.0 (CC0-1.0), https://github.com/HL7/v2-to-fhir at commit
// 873b331b3890c8bc5d62ef9b4dabb41801aac70d. Field positions, names and data types follow mappings/segments/
// "HL7 Segment - FHIR R4_ MSH[MessageHeader] - R4.csv" and the other MSH maps; optionality, repetition and table
// numbers are the HL7 v2.5.1 values (the guide records only minimum and maximum cardinality).
//
// Field names are the 2.5.1 names, shortened to identifiers, also where the guide names a field differently.
// Cross-checked against HAPI hapi-structures-v251 2.5.1 and hl7-dictionary 1.0.1 (version 2.5.1) for field count,
// data type, repetition and table number.
//
// Where 2.5.1 differs from the guide (v2.9):
// - MSH-22 to MSH-28 do not exist in 2.5.1 (they were added in 2.7 and later); the segment ends at MSH-21.
// - MSH-7 is TS, MSH-19 is CE (the guide has DTM and CWE).

import { field } from "../define";
import type { SegmentDefinition } from "../types";

/** The message header segment. */
export const msh: SegmentDefinition = {
  id: "MSH",
  fields: [
    field(1, "fieldSeparator", "ST", "R"),
    field(2, "encodingCharacters", "ST", "R"),
    field(3, "sendingApplication", "HD", "O", { table: "0361" }),
    field(4, "sendingFacility", "HD", "O", { table: "0362" }),
    field(5, "receivingApplication", "HD", "O", { table: "0361" }),
    field(6, "receivingFacility", "HD", "O", { table: "0362" }),
    field(7, "dateTimeOfMessage", "TS", "R"),
    field(8, "security", "ST"),
    field(9, "messageType", "MSG", "R"),
    field(10, "messageControlId", "ST", "R"),
    field(11, "processingId", "PT", "R"),
    field(12, "versionId", "VID", "R"),
    field(13, "sequenceNumber", "NM"),
    field(14, "continuationPointer", "ST"),
    field(15, "acceptAcknowledgmentType", "ID", "O", { table: "0155" }),
    field(16, "applicationAcknowledgmentType", "ID", "O", { table: "0155" }),
    field(17, "countryCode", "ID", "O", { table: "0399" }),
    field(18, "characterSet", "ID", "O", { repeats: true, table: "0211" }),
    field(19, "principalLanguageOfMessage", "CE"),
    field(20, "alternateCharacterSetHandlingScheme", "ID", "O", {
      table: "0356",
    }),
    field(21, "messageProfileIdentifier", "EI", "O", { repeats: true }),
  ],
};
