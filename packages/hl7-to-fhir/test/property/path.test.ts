import { test as propertyTest } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect } from "vitest";

import { get, getAll, isNull } from "../../src/hl7v2/access";
import type {
  Hl7Message,
  Repetition,
  Segment,
  Subcomponent,
} from "../../src/hl7v2/model";
import { parsePath } from "../../src/hl7v2/path";
import { parsed } from "../hl7v2/helpers";

const leaf = fc.constantFrom("", "a", "bc", '""', "0");
const list = <T>(item: fc.Arbitrary<T>) => fc.array(item, { maxLength: 3 });

/** Segments as fields of repetitions of components of subcomponent texts, written without escapes. */
const segments = fc.array(
  fc.tuple(
    fc.constantFrom("PID", "OBX", "NTE", "ZPI"),
    list(list(list(list(leaf)))),
  ),
  { maxLength: 6 },
);

function write(
  content: readonly (readonly [string, string[][][][]])[],
): string {
  const lines = content.map(([id, fields]) =>
    [
      id,
      ...fields.map((repetitions) =>
        repetitions
          .map((components) =>
            components
              .map((subcomponents) => subcomponents.join("&"))
              .join("^"),
          )
          .join("~"),
      ),
    ].join("|"),
  );
  return ["MSH|^~\\&|APP|FAC", ...lines].join("\r");
}

function textOf(subcomponent: Subcomponent | undefined): string | undefined {
  return subcomponent?.kind === "value" ? subcomponent.value : undefined;
}

/** HL7 positions are 1-based; the arrays of the tree are 0-based. */
function position(index: number): string {
  return String(index + 1);
}

/** The path of every field and of each of its repetitions, built from the structure of the tree. */
function repetitionPaths(message: Hl7Message): {
  readonly fieldPath: string;
  readonly repetitions: readonly {
    readonly path: string;
    readonly repetition: Repetition;
  }[];
}[] {
  const seen = new Map<string, number>();
  return message.segments.flatMap((segment) => {
    const occurrence = (seen.get(segment.id) ?? 0) + 1;
    seen.set(segment.id, occurrence);
    return segment.fields.map((field, fieldIndex) => {
      const fieldPath = `${segment.id}[${String(occurrence)}].${position(fieldIndex)}`;
      return {
        fieldPath,
        repetitions: field.repetitions.map((repetition, index) => ({
          path: `${fieldPath}[${position(index)}]`,
          repetition,
        })),
      };
    });
  });
}

describe("path properties", () => {
  propertyTest.prop([segments], { numRuns: 300 })(
    "reads every position of a parsed message through the path built from its structure",
    (content) => {
      const { message } = parsed(write(content));
      for (const { fieldPath, repetitions } of repetitionPaths(message)) {
        const firstTexts: string[] = [];
        for (const { path, repetition } of repetitions) {
          for (const [c, component] of repetition.components.entries()) {
            for (const [s, subcomponent] of component.subcomponents.entries()) {
              const leafPath = `${path}.${position(c)}.${position(s)}`;
              expect(get(message, leafPath)).toBe(textOf(subcomponent));
              expect(isNull(message, leafPath)).toBe(
                subcomponent.kind === "null",
              );
            }
          }
          const first = textOf(repetition.components[0]?.subcomponents[0]);
          if (first !== undefined) firstTexts.push(first);
        }
        expect(getAll(message, fieldPath)).toStrictEqual(firstTexts);
      }
    },
  );

  propertyTest.prop([segments], { numRuns: 300 })(
    "reads the first segment, repetition, component and subcomponent for a shortened path",
    (content) => {
      const { message } = parsed(write(content));
      const firstOfId = new Map<string, Segment>();
      for (const segment of message.segments) {
        if (!firstOfId.has(segment.id)) firstOfId.set(segment.id, segment);
      }
      for (const segment of firstOfId.values()) {
        for (const [fieldIndex, field] of segment.fields.entries()) {
          const base = `${segment.id}.${position(fieldIndex)}`;
          const first = field.repetitions[0]?.components[0]?.subcomponents[0];
          expect(get(message, base)).toBe(textOf(first));
          expect(get(message, `${base}.1`)).toBe(textOf(first));
          expect(get(message, `${base}[1].1.1`)).toBe(textOf(first));
        }
      }
    },
  );

  propertyTest.prop([fc.string({ unit: "binary", maxLength: 40 })])(
    "never throws, and reads nothing for a path that does not parse",
    (path) => {
      const { message } = parsed("MSH|^~\\&|APP\rPID|1||x");
      const values = [
        get(message, path),
        getAll(message, path),
        isNull(message, path),
      ];
      if (!parsePath(path).ok) {
        expect(values).toStrictEqual([undefined, [], false]);
      }
    },
  );
});
