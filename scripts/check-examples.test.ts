import { describe, expect, it } from "vitest";

import { findFunctionsWithoutExample } from "./check-examples.mjs";

const example =
  "/**\n * Does it.\n *\n * @example\n * ```ts\n * it();\n * ```\n */";
const noExample = "/** Does it. */";

function missing(text: string): string[] {
  return findFunctionsWithoutExample("api.d.ts", text);
}

describe("findFunctionsWithoutExample", () => {
  it("accepts exported functions with an example", () => {
    expect(
      missing(
        `${example}\ndeclare function parse(input: string): void;\nexport { parse };`,
      ),
    ).toStrictEqual([]);
  });

  it("reports exported functions without an example", () => {
    expect(
      missing(
        `${noExample}\ndeclare function parse(input: string): void;\ndeclare function stringify(): void;\nexport { parse, stringify };`,
      ),
    ).toStrictEqual(["parse", "stringify"]);
  });

  it("reports the public name of a function exported under another name", () => {
    expect(
      missing(
        `${noExample}\ndeclare function t(): void;\nexport { t as parse };`,
      ),
    ).toStrictEqual(["parse"]);
  });

  it("checks functions with an export modifier", () => {
    expect(
      missing(`${noExample}\nexport declare function parse(): void;`),
    ).toStrictEqual(["parse"]);
    expect(
      missing(`${example}\nexport declare function parse(): void;`),
    ).toStrictEqual([]);
  });

  it("accepts an example on any overload", () => {
    expect(
      missing(
        `${noExample}\ndeclare function get(a: string): string;\n${example}\ndeclare function get(a: number): number;\nexport { get };`,
      ),
    ).toStrictEqual([]);
  });

  it("ignores functions that are not exported and exports that are not functions", () => {
    expect(
      missing(
        `declare function helper(): void;\n${noExample}\ninterface Options {}\nexport type { Options };\nexport * from "./other.js";\nexport * as other from "./other.js";`,
      ),
    ).toStrictEqual([]);
  });

  it("ignores an @example in a comment that belongs to another declaration", () => {
    expect(
      missing(
        `${example}\ninterface Options {}\ndeclare function parse(): void;\nexport { parse, type Options };`,
      ),
    ).toStrictEqual(["parse"]);
  });
});
