// Every segment and group of the supported structures is legal in a message, so a message that holds all of them,
// each repeatable one twice, must group without a single issue and reproduce the nesting of the definition.
import { describe, expect, it } from "vitest";

import { messageStructures } from "../../src/hl7v2/definitions/message-structures";
import type { StructureElement } from "../../src/hl7v2/definitions/types";
import { type GroupChild, groupSegments } from "../../src/hl7v2/group";
import type { Hl7Message } from "../../src/hl7v2/model";
import type { Issue } from "../../src/shared/issue";
import { parsed } from "./helpers";

/** One line of the outline of a tree: a segment or a group, indented by its depth. */
interface Line {
  readonly kind: StructureElement["kind"];
  readonly text: string;
  readonly depth: number;
}

/** Every element of a structure in message order, each repeatable one twice, as outline lines. */
function fullOutline(elements: readonly StructureElement[], depth = 0): Line[] {
  return elements.flatMap((element) => {
    const occurrence =
      element.kind === "segment"
        ? [{ kind: element.kind, text: element.id, depth }]
        : [
            { kind: element.kind, text: element.name, depth },
            ...fullOutline(element.elements, depth + 1),
          ];
    return element.max === "unbounded"
      ? [...occurrence, ...occurrence]
      : occurrence;
  });
}

function outline(
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
          ...outline(message, child.children, depth + 1),
        ],
  );
}

const headers = new Map([
  ["ADT_A01", "MSH|^~\\&|ADT|HOSP|||20240115103000||ADT^A01^ADT_A01|1|P|2.5.1"],
  ["ORU_R01", "MSH|^~\\&|LAB|HOSP|||20240115103000||ORU^R01^ORU_R01|1|P|2.5.1"],
]);

describe("a message with every segment and group of its structure", () => {
  it.each([...headers])(
    "groups %s without issues and nests like the definition",
    async (id, header) => {
      const structure = messageStructures.get(id);
      const expected = fullOutline(structure?.elements ?? []);
      // The first segment is MSH, which the header supplies.
      const segments = expected
        .filter(({ kind, text }) => kind === "segment" && text !== "MSH")
        .map(({ text }) => `${text}|1`);
      const { message } = parsed([header, ...segments].join("\r"));
      const issues: Issue[] = [];
      const tree = groupSegments(message, () => false, issues);

      expect(issues).toStrictEqual([]);
      const actual = outline(message, tree.children);
      expect(actual).toStrictEqual(
        expected.map(({ text, depth }) => `${"  ".repeat(depth)}${text}`),
      );
      await expect(`${actual.join("\n")}\n`).toMatchFileSnapshot(
        `../golden/${id.toLowerCase().replace("_", "-")}.full-structure.txt`,
      );
    },
  );
});
