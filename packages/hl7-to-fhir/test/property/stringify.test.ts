import { test as propertyTest } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { parse } from "../../src/hl7v2/parse";
import { hl7Messages } from "../hl7v2/arbitraries";
import { parsed, stringified, withoutSpans } from "../hl7v2/helpers";

describe("stringify properties", () => {
  propertyTest.prop([hl7Messages], { numRuns: 500 })(
    "is the inverse of parse: reading the text gives the same tree without spans",
    (message) => {
      const result = parse(stringified(message));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(withoutSpans(result.value.message)).toStrictEqual(
          withoutSpans(message),
        );
        // Omitted delimiters and line feeds kept as data are worth an info, nothing more.
        for (const { code } of result.value.issues) {
          expect([
            "ENCODING_CHARACTERS_OMITTED",
            "LINE_FEED_IN_SEGMENT",
          ]).toContain(code);
        }
      }
    },
  );

  propertyTest.prop([hl7Messages], { numRuns: 500 })(
    "writes the text it reads back unchanged for canonical text under any delimiters",
    (message) => {
      const canonical = stringified(message);
      expect(stringified(parsed(canonical).message)).toBe(canonical);
    },
  );

  propertyTest.prop([hl7Messages])(
    "ends every segment with exactly one carriage return and writes line feeds only without escape character",
    (message) => {
      const text = stringified(message);
      expect(text.endsWith("\r")).toBe(true);
      expect(text.split("\r")).toHaveLength(message.segments.length + 1);
      if (message.delimiters.escape !== undefined) {
        expect(text).not.toContain("\n");
      }
    },
  );
});
