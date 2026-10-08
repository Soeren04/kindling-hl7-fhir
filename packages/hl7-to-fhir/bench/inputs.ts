// Inputs shared by the benchmarks. They are built from the synthetic samples or generated, so the numbers can be
// reproduced on any machine.
import { readFileSync } from "node:fs";

function sample(name: string): string {
  return readFileSync(
    new URL(`../../../samples/${name}.hl7`, import.meta.url),
    "utf8",
  );
}

/** The ADT^A01 sample: 6 segments, escapes, repetitions and subcomponents. */
export const adtA01: string = sample("adt-a01");

const oruHeader = [
  "MSH|^~\\&|LAB|GOOD HEALTH HOSPITAL|EHR|GOOD HEALTH HOSPITAL|20240116091500+0100||ORU^R01^ORU_R01|MSG00002|P|2.5.1",
  "PID|1||PATID1234^^^GOOD HEALTH HOSPITAL^MR||Everyman^Adam||19800101|M",
  "OBR|1|ORD0001|FIL0001|24331-1^Lipid panel^LN|||20240116080000+0100",
];

/** An ORU^R01 with `count` numeric OBX segments, each followed by every tenth a note. */
export function oruR01(count: number): string {
  const segments = [...oruHeader];
  for (let index = 1; index <= count; index++) {
    segments.push(
      `OBX|${String(index)}|NM|2093-3^Cholesterol^LN||${String(100 + (index % 100))}|mg/dL|<200|N|||F`,
    );
    if (index % 10 === 0) segments.push("NTE|1|L|Reviewed\\.br\\by the lab");
  }
  return `${segments.join("\r")}\r`;
}

/** An ORU^R01 with 50 OBX segments, a typical large lab result. */
export const oruR01With50Obx: string = oruR01(50);

const megabyte = 1_000_000;

/** An ORU^R01 of about 1 MB: many ordinary segments. */
export const oruOfOneMegabyte: string = oruR01(17_000);

/** Wraps `field` as the text of an OBX segment, which is how a very large value reaches the parser. */
function inField(field: string): string {
  return `${oruHeader[0] ?? ""}\rOBX|1|TX|||${field}\r`;
}

/** A 1 MB text value without delimiters: the cheapest field per byte. */
export const plainFieldOfOneMegabyte: string = inField("a".repeat(megabyte));

/** A 1 MB value of escape sequences: the decoder runs on every few bytes. */
export const escapedFieldOfOneMegabyte: string = inField(
  "\\.br\\".repeat(megabyte / 5),
);

/** A 1 MB value of 500,000 one-character subcomponents: the most nodes the finished tree can hold per byte. */
export const manyNodesOfOneMegabyte: string = inField(
  "a&".repeat(megabyte / 2),
);

/** A 1 MB value of empty subcomponents: the parser allocates a node per byte, then trims them all. */
export const emptyNodesOfOneMegabyte: string = inField("&".repeat(megabyte));

/** A batch file of about 1 MB with ADT^A01 messages, for `splitBatch`. */
export const batchOfOneMegabyte: string = (() => {
  const messages: string[] = [];
  let length = 0;
  while (length < megabyte) {
    messages.push(adtA01);
    length += adtA01.length;
  }
  return `FHS|^~\\&\rBHS|^~\\&\r${messages.join("")}BTS|${String(messages.length)}\rFTS|1\r`;
})();
