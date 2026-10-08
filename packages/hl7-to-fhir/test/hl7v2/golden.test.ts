import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parse } from "../../src/hl7v2/parse";

/** Pretty-printed JSON with every span on one line, which halves the size of the files and keeps them readable. */
function serialize(value: unknown): string {
  const json = JSON.stringify(value, null, 2).replace(
    /\{\n\s*"start": (\d+),\n\s*"end": (\d+)\n\s*\}/gu,
    '{ "start": $1, "end": $2 }',
  );
  return `${json}\n`;
}

// The expected trees are JSON files in test/golden. After an intended change of the model or the parser, update them
// with `pnpm test -u` and review the diff like code.
describe("golden parse trees", () => {
  it.each(["adt-a01", "oru-r01", "custom-delimiters"])(
    "parses samples/%s.hl7 into the expected tree",
    async (name) => {
      const input = readFileSync(
        new URL(`../../../../samples/${name}.hl7`, import.meta.url),
        "utf8",
      );
      const result = parse(input);
      expect(result.ok).toBe(true);
      await expect(serialize(result)).toMatchFileSnapshot(
        `../golden/${name}.json`,
      );
    },
  );
});
