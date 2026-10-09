import type { RuleDescription } from "../rule";

/** What the resolution of the message structure from MSH-9 checks. */
export const messageStructure: RuleDescription = {
  name: "message-structure",
  summary:
    "MSH-9 identifies the message structure: MSH-9.3 names it, or MSH-9.1 and MSH-9.2 imply it, an acknowledgment (`ACK`) being an ACK and other messages having the structure HL7 table 0354 assigns to their message code and trigger event (ADT^A04 is ADT_A01). When MSH-9.3 contradicts MSH-9.1 and MSH-9.2, the structure MSH-9.3 names is the one checked. The library defines the 2.5.1 structures ADT_A01 and ORU_R01; for others the order of the segments is not checked.",
  codes: [
    "MESSAGE_STRUCTURE_UNKNOWN",
    "MESSAGE_STRUCTURE_MISMATCH",
    "MESSAGE_STRUCTURE_UNSUPPORTED",
  ],
  scope: "every message",
};
