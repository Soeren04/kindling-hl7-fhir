import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { splitBatch } from "../../src/hl7v2/batch";
import type { Hl7Message } from "../../src/hl7v2/model";
import { parse } from "../../src/hl7v2/parse";
import type { Issue } from "../../src/shared/issue";

function readSample(name: string): string {
  return readFileSync(
    new URL(`../../../../samples/${name}.hl7`, import.meta.url),
    "utf8",
  );
}

/** Pretty-printed JSON with every span on one line, which halves the size of the files and keeps them readable. */
function serialize(value: unknown): string {
  const json = JSON.stringify(value, null, 2).replace(
    /\{\n\s*"start": (\d+),\n\s*"end": (\d+)\n\s*\}/gu,
    '{ "start": $1, "end": $2 }',
  );
  return `${json}\n`;
}

/**
 * A message as one line per value or null, in HL7 notation with every index written out
 * (`PID[1].5[1].1.1 = "Everyman"`), followed by one line per issue. Empty positions are left out.
 */
function compact(message: Hl7Message, issues: readonly Issue[]): string {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  for (const segment of message.segments) {
    const index = (counts.get(segment.id) ?? 0) + 1;
    counts.set(segment.id, index);
    for (const [f, field] of segment.fields.entries()) {
      for (const [r, repetition] of field.repetitions.entries()) {
        for (const [c, component] of repetition.components.entries()) {
          for (const [s, leaf] of component.subcomponents.entries()) {
            const path = `${segment.id}[${String(index)}].${String(f + 1)}[${String(r + 1)}].${String(c + 1)}.${String(s + 1)}`;
            if (leaf.kind === "value") {
              const truncated = leaf.truncated === true ? " (truncated)" : "";
              lines.push(`${path} = ${JSON.stringify(leaf.value)}${truncated}`);
            } else if (leaf.kind === "null") {
              lines.push(`${path} = null`);
            }
          }
        }
      }
    }
  }
  for (const { severity, code, location } of issues) {
    const span = location.span;
    lines.push(
      `${severity} ${code} at ${String(span.start)}-${String(span.end)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Parses `input` into the compact form, failing the test when parsing fails. */
function compactParse(input: string): string {
  const result = parse(input);
  if (!result.ok)
    return expect.fail(`expected to parse, got ${result.error.code}`);
  return compact(result.value.message, result.value.issues);
}

// The expected results are files in test/golden. After an intended change of the model or the parser, update them
// with `pnpm test -u` and review the diff like code.
describe("golden parse results", () => {
  // One full tree shows the model with every span; the compact form below covers the other inputs.
  it("parses samples/adt-a01.hl7 into the expected tree", async () => {
    const result = parse(readSample("adt-a01"));
    expect(result.ok).toBe(true);
    await expect(serialize(result)).toMatchFileSnapshot(
      "../golden/adt-a01.json",
    );
  });

  it.each(["adt-a01", "oru-r01", "custom-delimiters"])(
    "reads the values and issues of samples/%s.hl7",
    async (name) => {
      await expect(compactParse(readSample(name))).toMatchFileSnapshot(
        `../golden/${name}.values.txt`,
      );
    },
  );

  it("reads the values and issues of every message in samples/batch.hl7", async () => {
    const { messages, issues } = splitBatch(readSample("batch"));
    expect(issues).toStrictEqual([]);
    await expect(messages.map(compactParse).join("\n")).toMatchFileSnapshot(
      "../golden/batch.values.txt",
    );
  });

  it("reads a message wrapped in every tolerated transport artifact", async () => {
    // A byte order mark, an MLLP frame, CRLF terminators, a blank line, spaces in the last value and trailing
    // whitespace after the final terminator.
    const lines = readSample("adt-a01").trimEnd().split("\r");
    const framed = `\uFEFF\u000B${lines.slice(0, 2).join("\r\n")}\r\n\r\n${lines.slice(2).join("\r\n")}  \r\n\u001C\r \n\t`;
    await expect(compactParse(framed)).toMatchFileSnapshot(
      "../golden/framed.values.txt",
    );
  });
});
