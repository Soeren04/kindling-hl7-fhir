import type { Hl7Message } from "../../../src/hl7v2/model";
import { validate } from "../../../src/hl7v2/validate";
import type { Issue } from "../../../src/shared/issue";
import { parsed } from "../helpers";

/** The segments of a valid ADT^A01 message of version 2.5.1, which tests change one segment at a time. */
export const validAdt: Readonly<Record<"msh" | "evn" | "pid" | "pv1", string>> =
  {
    msh: "MSH|^~\\&|ADT|HOSP|EHR|HOSP|20240115103000+0100||ADT^A01^ADT_A01|MSG00001|P|2.5.1",
    evn: "EVN|A01|20240115103000+0100",
    pid: "PID|1||PATID1234^^^HOSP^MR||Everyman^Adam||19800101|M",
    pv1: "PV1|1|I",
  };

/** The segments of a valid ORU^R01 message of version 2.5.1. */
export const validOru: readonly string[] = [
  "MSH|^~\\&|LAB|HOSP|EHR|HOSP|20240116091500+0100||ORU^R01^ORU_R01|MSG00002|P|2.5.1",
  "PID|1||PATID1234^^^HOSP^MR||Everyman^Adam||19800101|M",
  "OBR|1|ORD0001|FIL0001|24331-1^Lipid panel^LN|||20240116080000+0100||||||||||||||||||F",
  "OBX|1|NM|2093-3^Cholesterol^LN||196|mg/dL|<200|N|||F",
];

/** The valid ADT^A01 message with some of its segments replaced. */
export function adtWith(
  replacements: Partial<Record<keyof typeof validAdt, string>> = {},
): string[] {
  const segments = { ...validAdt, ...replacements };
  return [segments.msh, segments.evn, segments.pid, segments.pv1];
}

/** Parses the segments as one message and validates it. */
export function validateSegments(segments: readonly string[]): {
  readonly message: Hl7Message;
  readonly issues: readonly Issue[];
} {
  const { message } = parsed(segments.join("\r"));
  return { message, issues: validate(message) };
}

/** The code and the location of every issue, which is what most tests compare. */
export function findings(
  issues: readonly Issue[],
): readonly (readonly [Issue["code"], Issue["location"]])[] {
  return issues.map(({ code, location }) => [code, location]);
}
