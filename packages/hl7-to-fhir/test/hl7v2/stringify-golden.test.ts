import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parsed, stringified, withoutSpans } from "./helpers";

const samples = ["adt-a01", "oru-r01", "custom-delimiters"];

function readSample(name: string): string {
  return readFileSync(
    new URL(`../../../../samples/${name}.hl7`, import.meta.url),
    "utf8",
  );
}

// The canonical forms are files in test/golden. They differ from the samples where parse loses information: removed
// formatting commands and the spelling of hexadecimal escapes. After an intended change, update them with
// `pnpm test -u` and review the diff like code.
describe("golden canonical text", () => {
  it.each(samples)(
    "writes samples/%s.hl7 in its canonical form",
    async (name) => {
      const canonical = stringified(parsed(readSample(name)).message);
      await expect(canonical).toMatchFileSnapshot(
        `../golden/${name}.canonical.hl7`,
      );
    },
  );

  it.each(samples)(
    "reads the canonical form of %s back as the same message",
    (name) => {
      const original = parsed(readSample(name)).message;
      const canonical = stringified(original);
      const again = parsed(canonical).message;
      expect(withoutSpans(again)).toStrictEqual(withoutSpans(original));
      expect(stringified(again)).toBe(canonical);
    },
  );
});
