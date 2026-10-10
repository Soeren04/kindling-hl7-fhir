import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { pathToFileURL } from "node:url";

import {
  extractExamples,
  findBrokenExamples,
  findFunctionsWithoutExample,
  findWrongClaims,
  instrumentClaims,
} from "./check-examples.mjs";

/** A TSDoc comment whose `@example` holds the given lines as one `ts` block. */
function documented(...code: string[]): string {
  const lines = code.map((line) => ` * ${line}`.trimEnd());
  return [
    "/**",
    " * Does it.",
    " *",
    " * @example",
    " * ```ts",
    ...lines,
    " * ```",
    " */",
  ].join("\n");
}

const example = documented("it();");
const noExample = "/** Does it. */";

function missing(files: Record<string, string>): string[] {
  return findFunctionsWithoutExample(new Map(Object.entries(files)));
}

function broken(files: Record<string, string>): string[] {
  return findBrokenExamples(new Map(Object.entries(files)));
}

describe("findFunctionsWithoutExample", () => {
  it("accepts exported functions with an example", () => {
    expect(
      missing({
        "api.d.ts": `${example}\ndeclare function parse(input: string): void;\nexport { parse };`,
      }),
    ).toStrictEqual([]);
  });

  it("reports exported functions without an example", () => {
    expect(
      missing({
        "api.d.ts": `${noExample}\ndeclare function parse(input: string): void;\ndeclare function stringify(): void;\nexport { parse, stringify };`,
      }),
    ).toStrictEqual(["api.d.ts: parse", "api.d.ts: stringify"]);
  });

  it("reports the public name of a function exported under another name", () => {
    expect(
      missing({
        "api.d.ts": `${noExample}\ndeclare function t(): void;\nexport { t as parse };`,
      }),
    ).toStrictEqual(["api.d.ts: parse"]);
  });

  it("checks functions with an export modifier", () => {
    expect(
      missing({
        "api.d.ts": `${noExample}\nexport declare function parse(): void;`,
      }),
    ).toStrictEqual(["api.d.ts: parse"]);
    expect(
      missing({
        "api.d.ts": `${example}\nexport declare function parse(): void;`,
      }),
    ).toStrictEqual([]);
  });

  it("accepts an example on any overload", () => {
    expect(
      missing({
        "api.d.ts": `${noExample}\ndeclare function get(a: string): string;\n${example}\ndeclare function get(a: number): number;\nexport { get };`,
      }),
    ).toStrictEqual([]);
  });

  it("ignores functions that are not exported and exports that are not functions", () => {
    expect(
      missing({
        "api.d.ts": `declare function helper(): void;\n${noExample}\ninterface Options {}\nclass Parser {}\ndeclare const version: string;\nexport type { Options };\nexport { Parser, version };`,
      }),
    ).toStrictEqual([]);
  });

  it("ignores an @example in a comment that belongs to another declaration", () => {
    expect(
      missing({
        "api.d.ts": `${example}\ninterface Options {}\ndeclare function parse(): void;\nexport { parse, type Options };`,
      }),
    ).toStrictEqual(["api.d.ts: parse"]);
  });

  it("follows a re-export to the documentation of the function", () => {
    const documentedChunk = `${example}\ndeclare function parse(): void;\nexport { parse };`;
    expect(
      missing({
        "chunk.d.ts": documentedChunk,
        "index.d.ts": `export { parse } from "./chunk.js";`,
      }),
    ).toStrictEqual([]);
    expect(
      missing({
        "chunk.d.ts": `${noExample}\ndeclare function parse(): void;\nexport { parse };`,
        "index.d.ts": `export { parse as read } from "./chunk.js";`,
      }),
    ).toStrictEqual(["chunk.d.ts: parse", "index.d.ts: read"]);
  });

  it("follows export * and export * as to the functions they expose", () => {
    const chunk = `${noExample}\nexport declare function parse(): void;`;
    expect(
      missing({
        "chunk.d.ts": chunk,
        "all.d.ts": `export * from "./chunk.js";`,
        "namespace.d.ts": `export * as hl7 from "./chunk.js";`,
      }),
    ).toStrictEqual([
      "all.d.ts: parse",
      "chunk.d.ts: parse",
      "namespace.d.ts: hl7.parse",
    ]);
  });

  it("checks a default export", () => {
    expect(
      missing({
        "declaration.d.ts": `${noExample}\nexport default function parse(): void;`,
        "reference.d.ts": `${noExample}\ndeclare function parse(): void;\nexport default parse;`,
      }),
    ).toStrictEqual(["declaration.d.ts: default", "reference.d.ts: default"]);
    expect(
      missing({
        "api.d.ts": `${example}\nexport default function parse(): void;`,
      }),
    ).toStrictEqual([]);
  });

  it("treats a constant holding a function like a function", () => {
    expect(
      missing({
        "api.d.ts": `${noExample}\nexport declare const parse: (input: string) => void;`,
      }),
    ).toStrictEqual(["api.d.ts: parse"]);
    expect(
      missing({
        "api.d.ts": `${example}\nexport declare const parse: (input: string) => void;`,
      }),
    ).toStrictEqual([]);
  });

  it("does not loop on modules that export each other", () => {
    expect(
      missing({
        "a.d.ts": `export * as b from "./b.js";`,
        "b.d.ts": `export * as a from "./a.js";`,
      }),
    ).toStrictEqual([]);
  });
});

describe("extractExamples", () => {
  it("collects the blocks of declarations and of interface members", () => {
    const text = [
      documented("const a = 1;"),
      "declare function run(): void;",
      "interface Options {",
      `  ${documented("const b = 2;").replaceAll("\n", "\n  ")}`,
      "  readonly flag: boolean;",
      "}",
      documented("const c = 3;"),
      "declare const answer: number;",
    ].join("\n");
    expect(extractExamples("api.d.ts", text)).toStrictEqual({
      examples: [
        { owner: "run", code: "const a = 1;" },
        { owner: "Options.flag", code: "const b = 2;" },
        { owner: "answer", code: "const c = 3;" },
      ],
      problems: [],
    });
  });

  it("reports an @example without a ts block and ignores other languages", () => {
    const text = [
      "/**\n * @example\n * run();\n */",
      "declare function run(): void;",
      "/**\n * @example\n * ```sh\n * run\n * ```\n */",
      "declare function other(): void;",
    ].join("\n");
    expect(extractExamples("api.d.ts", text)).toStrictEqual({
      examples: [],
      problems: [
        "api.d.ts: the @example of run has no ```ts block",
        "api.d.ts: the @example of other has no ```ts block",
      ],
    });
  });

  it("keeps several blocks of one tag apart", () => {
    const text =
      "/**\n * @example\n * ```ts\n * one();\n * ```\n * ```typescript\n * two();\n * ```\n */\ndeclare function run(): void;";
    expect(
      extractExamples("api.d.ts", text).examples.map(({ code }) => code),
    ).toStrictEqual(["one();", "two();"]);
  });
});

describe("findBrokenExamples", () => {
  const declarations = {
    "index.d.ts": "export type Id = string;\nexport {};",
    "hl7v2.d.ts": `export declare function parse(input: string): number;\nexport interface Message { readonly version?: string | undefined }`,
  };

  function check(...code: string[]): string[] {
    return broken({
      ...declarations,
      "api.d.ts": `${documented(...code)}\nexport declare function run(): void;`,
    });
  }

  it("accepts self-contained examples that use the package and declared values", () => {
    expect(
      check(
        'import type { Id } from "hl7-to-fhir";',
        'import { parse, type Message } from "hl7-to-fhir/hl7v2";',
        "declare const id: Id;",
        "declare const message: Message;",
        "console.log(parse(id), message.version);",
      ),
    ).toStrictEqual([]);
  });

  it("resolves the FHIR types the declarations and examples name from the package's @types/fhir", () => {
    const withFhir = {
      "index.d.ts": `import type { Bundle } from "fhir/r4";\nexport declare function convert(input: string): Bundle;`,
      "hl7v2.d.ts": "export {};",
    };
    const example = (gender: string): string[] =>
      broken({
        ...withFhir,
        "api.d.ts": `${documented(
          'import type { Patient } from "fhir/r4";',
          'import { convert } from "hl7-to-fhir";',
          `const patient: Patient = { resourceType: "Patient", gender: "${gender}" };`,
          'console.log(convert("MSH").type, patient.gender);',
        )}\nexport declare function run(): void;`,
      });
    expect(example("female")).toStrictEqual([]);
    // The types are the real ones, not `any`: a gender FHIR does not have fails.
    expect(example("woman")).toHaveLength(1);
  });

  it("keeps the declarations of different examples apart", () => {
    expect(
      broken({
        ...declarations,
        "api.d.ts": `${documented("declare const x: string;", "x.length;")}\nexport declare function a(): void;\n${documented("declare const x: number;", "x.toFixed();")}\nexport declare function b(): void;`,
      }),
    ).toStrictEqual([]);
  });

  it("reports an unknown name with its line", () => {
    expect(
      check("const known = 1;", "console.log(known, nothing);"),
    ).toStrictEqual([
      "api.d.ts: the @example of run does not compile (line 2): TS2304 Cannot find name 'nothing'.",
    ]);
  });

  it("reports a type error against the declarations", () => {
    const [problem, ...rest] = check(
      'import { parse } from "hl7-to-fhir/hl7v2";',
      "parse(42);",
    );
    expect(rest).toStrictEqual([]);
    expect(problem).toContain("(line 2): TS2345");
  });

  it("reports an import the package does not offer", () => {
    expect(
      check('import { missing } from "hl7-to-fhir";', "missing();"),
    ).toHaveLength(1);
  });

  it("holds examples to the strictness of the library", () => {
    expect(
      check(
        'import type { Message } from "hl7-to-fhir/hl7v2";',
        "const message: Message = { version: undefined };",
        "const items = [1];",
        "const first: number = items[0];",
      ),
    ).toHaveLength(1);
  });

  it("reports an @example without a ts block", () => {
    expect(
      broken({
        "api.d.ts":
          "/**\n * @example\n * run();\n */\nexport declare function run(): void;",
      }),
    ).toStrictEqual(["api.d.ts: the @example of run has no ```ts block"]);
  });
});

describe("check-examples command", () => {
  const script = path.resolve(import.meta.dirname, "check-examples.mjs");
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function run(files: Record<string, string>): {
    status: number | null;
    stderr: string;
  } {
    const directory = mkdtempSync(path.join(tmpdir(), "check-examples-"));
    directories.push(directory);
    const declarations = path.join(directory, "dist");
    mkdirSync(declarations);
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(declarations, name), text);
    }
    const { status, stderr } = spawnSync(process.execPath, [script, "dist"], {
      cwd: directory,
      encoding: "utf8",
    });
    return { status, stderr };
  }

  it("exits with 0 when every function has a compiling example", () => {
    expect(
      run({
        "hl7v2.d.ts": `${documented('import { run } from "hl7-to-fhir/hl7v2";', "run();")}\nexport declare function run(): void;`,
      }),
    ).toStrictEqual({ status: 0, stderr: "" });
  });

  it("exits with 1 and names a function without an example", () => {
    const { status, stderr } = run({
      "hl7v2.d.ts": `${noExample}\nexport declare function run(): void;`,
    });
    expect(status).toBe(1);
    expect(stderr).toBe(
      "Examples: hl7v2.d.ts: run has no @example in its TSDoc\n",
    );
  });

  it("exits with 1 and names an example that does not compile", () => {
    const { status, stderr } = run({
      "hl7v2.d.ts": `${documented("run();")}\nexport declare function run(): void;`,
    });
    expect(status).toBe(1);
    expect(stderr).toContain(
      "the @example of run does not compile (line 1): TS2304",
    );
  });

  it("exits with 1 when the directory has no declarations", () => {
    const { status, stderr } = run({ "README.md": "nothing" });
    expect(status).toBe(1);
    expect(stderr).toContain("no .d.ts files");
  });
});

describe("findWrongClaims", () => {
  // A stand-in for the built library: a module the snippets import by its package name.
  const library = mkdtempSync(path.join(tmpdir(), "claims-"));
  writeFileSync(
    path.join(library, "index.js"),
    'export const answer = () => 42;\nexport const person = () => ({ name: "Adam", age: undefined });\n',
  );
  const modules = {
    "hl7-to-fhir": pathToFileURL(path.join(library, "index.js")).href,
  };
  afterAll(() => {
    rmSync(library, { recursive: true, force: true });
  });

  function wrong(...code: string[]): Promise<string[]> {
    const declarations = new Map([
      ["api.d.ts", `${documented(...code)}\ndeclare function run(): void;`],
    ]);
    return findWrongClaims(declarations, modules);
  }

  const imports = 'import { answer, person } from "hl7-to-fhir";';

  it("accepts a claim that holds", async () => {
    expect(
      await wrong(
        imports,
        "answer(); // => 42",
        "person(); // => { name: 'Adam', age: undefined }",
      ),
    ).toStrictEqual([]);
  });

  it("reports a claim that does not hold, with both values", async () => {
    expect(await wrong(imports, "answer(); // => 41")).toStrictEqual([
      "api.d.ts: the @example of run claims 41 on line 2, but the result is 42",
    ]);
  });

  it("compares objects by value and by their undefined properties", async () => {
    expect(
      await wrong(imports, "person(); // => { name: 'Adam' }"),
    ).toHaveLength(1);
  });

  it("compares the arguments of a console call with the claimed expressions", async () => {
    expect(
      await wrong(imports, "console.log(answer(), 'a'); // => 42, 'a'"),
    ).toStrictEqual([]);
    expect(
      await wrong(imports, "console.error(answer()); // => 41"),
    ).toHaveLength(1);
  });

  it("checks a claim every time its statement runs", async () => {
    expect(
      await wrong(imports, "for (const n of [42, 1]) console.log(n); // => 42"),
    ).toStrictEqual([
      "api.d.ts: the @example of run claims [ 42 ] on line 2, but the result is [ 1 ]",
    ]);
  });

  it("reports a claim whose statement never runs", async () => {
    expect(
      await wrong(imports, "if (answer() > 100) answer(); // => 42"),
    ).toStrictEqual([
      "api.d.ts: the @example of run claims an output on line 2 that is never reached",
    ]);
  });

  it("reports an example that throws", async () => {
    const problems = await wrong(
      imports,
      "throw new Error('boom');",
      "answer(); // => 42",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("the @example of run throws: Error: boom");
  });

  it("does not run an example without claims", async () => {
    expect(await wrong("throw new Error('not run');")).toStrictEqual([]);
  });

  it("ignores comments that do not start with an arrow", async () => {
    expect(
      await wrong(imports, "answer(); // 41", "answer(); // =>"),
    ).toStrictEqual([]);
  });
});

describe("instrumentClaims", () => {
  it("finds no claims in a snippet without any", () => {
    expect(instrumentClaims("const a = 1; // one", {}).lines).toStrictEqual([]);
  });

  it("points the imports of the package at the built modules", () => {
    const { program } = instrumentClaims(
      'import { a } from "pkg";\na; // => 1',
      {
        pkg: "file:///built.js",
      },
    );
    expect(program).toContain('from "file:///built.js"');
  });
});
