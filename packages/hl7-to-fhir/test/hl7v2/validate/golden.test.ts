import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { splitBatch } from "../../../src/hl7v2/batch";
import { group, type GroupChild } from "../../../src/hl7v2/group";
import type { Hl7Message } from "../../../src/hl7v2/model";
import { validate } from "../../../src/hl7v2/validate";
import type { Issue, Location } from "../../../src/shared/issue";
import { parsed } from "../helpers";

function readSample(name: string): string {
  return readFileSync(
    new URL(`../../../../../samples/${name}.hl7`, import.meta.url),
    "utf8",
  );
}

/** A location in HL7 notation, such as `PID[2]-5[1].1.1`, with its span. */
function address(location: Location): string {
  const { segmentId = "?", segmentIndex, field, repetition } = location;
  const { component, subcomponent, span } = location;
  const index = segmentIndex === undefined ? "" : `[${String(segmentIndex)}]`;
  const parts = [
    field === undefined ? "" : `-${String(field)}`,
    repetition === undefined ? "" : `[${String(repetition)}]`,
    component === undefined ? "" : `.${String(component)}`,
    subcomponent === undefined ? "" : `.${String(subcomponent)}`,
  ];
  return `${segmentId}${index}${parts.join("")} at ${String(span.start)}-${String(span.end)}`;
}

/** One line per issue: severity, code, location and value. */
function issueLines(issues: readonly Issue[]): string[] {
  return issues.map(({ severity, code, location, value }) => {
    const raw = value === undefined ? "" : ` = ${JSON.stringify(value)}`;
    return `${severity} ${code} ${address(location)}${raw}`;
  });
}

/** The groups of a message, one line per group or segment, indented by depth. */
function groupLines(
  message: Hl7Message,
  children: readonly GroupChild[],
  depth = 0,
): string[] {
  const indent = "  ".repeat(depth);
  return children.flatMap((child) =>
    child.kind === "segment"
      ? [`${indent}${message.segments[child.segmentIndex]?.id ?? "?"}`]
      : [
          `${indent}${child.name}`,
          ...groupLines(message, child.children, depth + 1),
        ],
  );
}

/** The validation issues and the groups of one message, as the golden files hold them. */
function report(input: string): string {
  const { message } = parsed(input);
  const groups = group(message);
  const lines = [
    `structure ${groups.structure ?? "unknown"}`,
    ...groupLines(message, groups.children),
    "",
    "issues",
    ...issueLines(validate(message)),
  ];
  return `${lines.join("\n")}\n`;
}

// The expected results are files in test/golden. After an intended change of the rules or the definitions, update them
// with `pnpm test -u` and review the diff like code.
describe("golden validation results", () => {
  it.each(["adt-a01", "oru-r01", "custom-delimiters"])(
    "validates samples/%s.hl7",
    async (name) => {
      await expect(report(readSample(name))).toMatchFileSnapshot(
        `../../golden/${name}.validation.txt`,
      );
    },
  );

  it("validates every message in samples/batch.hl7", async () => {
    const { messages } = splitBatch(readSample("batch"));
    await expect(messages.map(report).join("\n")).toMatchFileSnapshot(
      "../../golden/batch.validation.txt",
    );
  });
});
