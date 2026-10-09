// @ts-check
// Checks the `@example` tags of the public API (ADR 0007). It reads the bundled declarations, so it checks exactly what
// users see:
//   1. every exported function has an example, however it is exported (`export { … }`, `export … from`,
//      `export default`, `export * as …`);
//   2. every example compiles as a self-contained snippet against those declarations. A snippet may import from
//      "hl7-to-fhir" and "hl7-to-fhir/hl7v2" and declare what it uses with `declare const x: T;`;
//   3. every output an example claims is what the built library produces. A claim is a comment `// => <expression>` after
//      an expression statement, which must evaluate to the value of the expression, or after a `console` call, whose
//      arguments must equal the comma-separated expressions.
// Usage: `node check-examples.mjs <directory with .d.ts and .js files>`.
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect, isDeepStrictEqual } from "node:util";

import ts from "typescript";

/** Where the declarations and the snippets live in the in-memory file system the compiler works on. */
const declarationRoot = "/declarations";
const snippetRoot = "/snippets";

/** The import specifiers of the package and the declaration file that answers each of them. */
const packageEntries = {
  "hl7-to-fhir": `${declarationRoot}/index.d.ts`,
  "hl7-to-fhir/hl7v2": `${declarationRoot}/hl7v2.d.ts`,
};

/**
 * One code block of an `@example` tag.
 *
 * @typedef {object} Example
 * @property {string} owner - The declaration the tag belongs to, such as `parse` or `Hl7Message.version`.
 * @property {string} code - The snippet.
 */

/**
 * What an instrumented example exports after it ran: what every claim stated and what was true.
 *
 * @typedef {object} Run
 * @property {{ line: number, actual: unknown, expected: unknown }[]} claims
 */

/**
 * @param {string} name
 * @returns {boolean} Whether the path is inside the in-memory file system.
 */
function isVirtual(name) {
  return (
    name.startsWith(`${declarationRoot}/`) || name.startsWith(`${snippetRoot}/`)
  );
}

/**
 * Creates a program over in-memory files and the real default libraries.
 *
 * @param {ReadonlyMap<string, string>} files - Content by absolute path.
 * @param {readonly string[]} rootNames - The files to compile.
 * @returns {ts.Program} The program.
 */
function createProgram(files, rootNames) {
  /** @type {ts.CompilerOptions} */
  const options = {
    target: ts.ScriptTarget.ES2022,
    // The DOM library provides `console`, which the examples use, without pulling in the Node typings.
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    // Every snippet is a module of its own, so the `declare const` lines of different snippets cannot collide.
    moduleDetection: ts.ModuleDetectionKind.Force,
    paths: Object.fromEntries(
      Object.entries(packageEntries).map(([name, file]) => [name, [file]]),
    ),
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noPropertyAccessFromIndexSignature: true,
    // The declarations are the build's responsibility; only the snippets are checked here.
    skipLibCheck: true,
    types: [],
    noEmit: true,
  };
  const base = ts.createCompilerHost(options);
  return ts.createProgram(rootNames, options, {
    ...base,
    fileExists: (name) =>
      files.has(name) || (!isVirtual(name) && base.fileExists(name)),
    readFile: (name) =>
      files.get(name) ?? (isVirtual(name) ? undefined : base.readFile(name)),
    directoryExists: (name) =>
      name === declarationRoot ||
      name === snippetRoot ||
      (!isVirtual(`${name}/`) && base.directoryExists?.(name) === true),
    getSourceFile: (name, languageVersion) => {
      const text = files.get(name);
      return text === undefined
        ? base.getSourceFile(name, languageVersion)
        : ts.createSourceFile(name, text, languageVersion, true);
    },
  });
}

/**
 * Places declaration files in the in-memory file system.
 *
 * @param {ReadonlyMap<string, string>} declarations - Declaration files by file name.
 * @returns {Map<string, string>} The same files under the declaration root.
 */
function declarationFiles(declarations) {
  return new Map(
    [...declarations].map(([name, text]) => [
      `${declarationRoot}/${name}`,
      text,
    ]),
  );
}

/**
 * @param {ts.Node} declaration
 * @returns {boolean} Whether the declaration carries an `@example` tag.
 */
function hasExampleTag(declaration) {
  return ts
    .getJSDocTags(declaration)
    .some((tag) => tag.tagName.text === "example");
}

/**
 * Tells whether an export is a function: a function declaration, or anything else callable that is not a class, so a
 * `const` holding an arrow function is not an exception.
 *
 * @param {ts.TypeChecker} checker
 * @param {ts.Symbol} symbol - The resolved export.
 * @returns {boolean} Whether the export is a function.
 */
function isFunction(checker, symbol) {
  if (symbol.flags & ts.SymbolFlags.Function) return true;
  const declaration = symbol.valueDeclaration;
  return (
    declaration !== undefined &&
    !(symbol.flags & ts.SymbolFlags.Class) &&
    checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures()
      .length > 0
  );
}

/**
 * Lists the exported functions without an `@example` tag. The type checker follows re-exports, default exports and
 * namespace re-exports to the declaration the documentation is written on.
 *
 * A function counts as documented when any of its overloads has the tag.
 *
 * @param {ReadonlyMap<string, string>} declarations - Declaration files by file name.
 * @returns {string[]} `file: name` for every export without an example, in file order.
 */
export function findFunctionsWithoutExample(declarations) {
  const files = declarationFiles(declarations);
  const program = createProgram(files, [...files.keys()]);
  const checker = program.getTypeChecker();
  /** @type {string[]} */
  const missing = [];

  /**
   * @param {string} file
   * @param {ts.Symbol} module
   * @param {string} prefix
   * @param {Set<ts.Symbol>} visited
   */
  const visit = (file, module, prefix, visited) => {
    if (visited.has(module)) return;
    visited.add(module);
    for (const exported of checker.getExportsOfModule(module)) {
      const target =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      const name = `${prefix}${exported.name}`;
      if (target.flags & ts.SymbolFlags.Module) {
        visit(file, target, `${name}.`, visited);
      } else if (
        isFunction(checker, target) &&
        !(target.declarations ?? []).some(hasExampleTag)
      ) {
        missing.push(`${file}: ${name}`);
      }
    }
  };

  for (const name of [...declarations.keys()].sort()) {
    const source = program.getSourceFile(`${declarationRoot}/${name}`);
    const module = source && checker.getSymbolAtLocation(source);
    if (module !== undefined) visit(name, module, "", new Set());
  }
  return missing;
}

/**
 * Splits the text of an `@example` tag into its `ts` code blocks.
 *
 * @param {string} comment
 * @returns {string[]} The blocks without their fences.
 */
function codeBlocks(comment) {
  /** @type {string[]} */
  const blocks = [];
  /** @type {string[] | undefined} */
  let current;
  for (const line of comment.split("\n")) {
    const fence = line.trim();
    if (!fence.startsWith("```")) {
      current?.push(line);
    } else if (current !== undefined) {
      blocks.push(current.join("\n"));
      current = undefined;
    } else if (fence === "```ts" || fence === "```typescript") {
      current = [];
    }
  }
  return blocks;
}

/**
 * Collects the code blocks of every `@example` tag in a declaration file: on top-level declarations and on the members
 * of interfaces and classes.
 *
 * @param {string} fileName - The file name, for parsing and messages.
 * @param {string} text - The declaration file content.
 * @returns {{ examples: Example[], problems: string[] }} The snippets, and a problem for every tag without a `ts` block.
 */
export function extractExamples(fileName, text) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.ES2022,
    true,
  );
  /** @type {Example[]} */
  const examples = [];
  /** @type {string[]} */
  const problems = [];

  /**
   * @param {ts.Node} node
   * @param {string} owner
   */
  const collect = (node, owner) => {
    for (const tag of ts.getJSDocTags(node)) {
      if (tag.tagName.text !== "example") continue;
      const blocks = codeBlocks(ts.getTextOfJSDocComment(tag.comment) ?? "");
      if (blocks.length === 0) {
        problems.push(
          `${fileName}: the @example of ${owner} has no \`\`\`ts block`,
        );
      }
      for (const code of blocks) examples.push({ owner, code });
    }
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        const name = ts.getNameOfDeclaration(member)?.getText(source);
        collect(member, `${owner}.${name ?? "(member)"}`);
      }
    }
  };

  for (const statement of source.statements) {
    const declaration = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations[0]
      : statement;
    const name =
      declaration &&
      ts.getNameOfDeclaration(/** @type {ts.Declaration} */ (declaration));
    collect(statement, name?.getText(source) ?? "(declaration)");
  }
  return { examples, problems };
}

/**
 * Type-checks every example against the declarations.
 *
 * @param {ReadonlyMap<string, string>} declarations - Declaration files by file name.
 * @returns {string[]} One problem per example without a `ts` block and one per compiler error in an example.
 */
export function findBrokenExamples(declarations) {
  const files = declarationFiles(declarations);
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, { file: string, owner: string }>} */
  const origins = new Map();
  for (const [name, text] of declarations) {
    const extracted = extractExamples(name, text);
    problems.push(...extracted.problems);
    for (const example of extracted.examples) {
      const snippet = `${snippetRoot}/${String(origins.size)}.ts`;
      files.set(snippet, example.code);
      origins.set(snippet, { file: name, owner: example.owner });
    }
  }
  const program = createProgram(files, [...origins.keys()]);
  for (const [snippet, origin] of origins) {
    const source = program.getSourceFile(snippet);
    if (source === undefined) continue;
    for (const diagnostic of [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ]) {
      const line =
        diagnostic.start === undefined
          ? 1
          : source.getLineAndCharacterOfPosition(diagnostic.start).line + 1;
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        " ",
      );
      problems.push(
        `${origin.file}: the @example of ${origin.owner} does not compile (line ${String(line)}): TS${String(diagnostic.code)} ${message}`,
      );
    }
  }
  return problems;
}

/** A claim in an example: the statement it follows and the expression its comment gives. */
const claimComment = /^\/\/ => (.+)$/u;

/**
 * Whether the expression is a call of a method of `console`, such as `console.log(…)`.
 *
 * @param {ts.Expression} expression
 * @returns {expression is ts.CallExpression} Whether the expression is a console call.
 */
function isConsoleCall(expression) {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === "console"
  );
}

/**
 * Rewrites the claims of a snippet into calls that record what is claimed and what is true, and appends the export of
 * the records. The snippet's own imports of the package are pointed at the built modules.
 *
 * @param {string} code - The snippet.
 * @param {Readonly<Record<string, string>>} modules - The URL of the built module by import specifier.
 * @returns {{ program: string, lines: number[] }} The program as JavaScript and the line of every claim in the snippet;
 *   `lines` is empty when the snippet claims nothing.
 */
export function instrumentClaims(code, modules) {
  const source = ts.createSourceFile(
    "snippet.ts",
    code,
    ts.ScriptTarget.ES2022,
    true,
  );
  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = [];
  /** @type {number[]} */
  const lines = [];

  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isExpressionStatement(node)) {
      const claimed = ts
        .getTrailingCommentRanges(code, node.end)
        ?.map(({ pos, end }) => claimComment.exec(code.slice(pos, end))?.[1])
        .find((text) => text !== undefined);
      if (claimed !== undefined) {
        const { expression } = node;
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        lines.push(line);
        const consoleArguments = isConsoleCall(expression)
          ? expression.arguments
          : undefined;
        const actual = consoleArguments
          ? `[${consoleArguments.map((argument) => argument.getText(source)).join(", ")}]`
          : expression.getText(source);
        const expected = consoleArguments ? `[${claimed}]` : `(${claimed})`;
        edits.push({
          start: expression.getStart(),
          end: expression.end,
          text: `claim(${String(line)}, ${actual}, ${expected})`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  let instrumented = code;
  for (const edit of edits.reverse()) {
    instrumented =
      instrumented.slice(0, edit.start) +
      edit.text +
      instrumented.slice(edit.end);
  }
  for (const [specifier, url] of Object.entries(modules)) {
    instrumented = instrumented.replaceAll(
      `"${specifier}"`,
      JSON.stringify(url),
    );
  }
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
    },
  }).outputText;
  const recorder =
    "export const claims = [];\n" +
    "function claim(line, actual, expected) { claims.push({ line, actual, expected }); return actual; }\n";
  return { program: recorder + javascript, lines };
}

/**
 * Runs the examples that claim outputs against the built library.
 *
 * @param {ReadonlyMap<string, string>} declarations - Declaration files by file name.
 * @param {Readonly<Record<string, string>>} modules - The URL of the built module by import specifier.
 * @returns {Promise<string[]>} A problem for every claim that is wrong, never reached, or whose example throws.
 */
export async function findWrongClaims(declarations, modules) {
  /** @type {string[]} */
  const problems = [];
  const directory = mkdtempSync(path.join(tmpdir(), "examples-"));
  try {
    let count = 0;
    for (const [file, text] of declarations) {
      for (const { owner, code } of extractExamples(file, text).examples) {
        const { program, lines } = instrumentClaims(code, modules);
        if (lines.length === 0) continue;
        const where = `${file}: the @example of ${owner}`;
        const script = path.join(directory, `${String(count++)}.mjs`);
        writeFileSync(script, program);
        /** @type {Run} */
        let run;
        try {
          /** @type {unknown} */
          const loaded = await import(pathToFileURL(script).href);
          run = /** @type {Run} */ (loaded);
        } catch (error) {
          problems.push(`${where} throws: ${String(error)}`);
          continue;
        }
        for (const line of lines) {
          const claims = run.claims.filter((claim) => claim.line === line);
          if (claims.length === 0) {
            problems.push(
              `${where} claims an output on line ${String(line)} that is never reached`,
            );
          }
          for (const { actual, expected } of claims) {
            if (isDeepStrictEqual(actual, expected)) continue;
            problems.push(
              `${where} claims ${inspectValue(expected)} on line ${String(line)}, but the result is ${inspectValue(actual)}`,
            );
          }
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return problems;
}

/**
 * @param {unknown} value
 * @returns {string} The value as JSON-like text for a message.
 */
function inspectValue(value) {
  return inspect(value, { depth: 4, breakLength: Infinity });
}

// Exercised by spawning the script in the tests and by `pnpm check:api`; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const directory = process.argv[2] ?? ".";
  const names = readdirSync(directory).filter((name) => name.endsWith(".d.ts"));
  const declarations = new Map(
    names.map((name) => [
      name,
      readFileSync(path.join(directory, name), "utf8"),
    ]),
  );
  const absolute = path.resolve(directory);
  const problems = [
    ...findFunctionsWithoutExample(declarations).map(
      (entry) => `${entry} has no @example in its TSDoc`,
    ),
    ...findBrokenExamples(declarations),
    ...(await findWrongClaims(declarations, {
      "hl7-to-fhir": pathToFileURL(path.join(absolute, "index.js")).href,
      "hl7-to-fhir/hl7v2": pathToFileURL(path.join(absolute, "hl7v2.js")).href,
    })),
  ];
  for (const problem of problems) console.error(`Examples: ${problem}`);
  if (names.length === 0)
    console.error(`Examples: no .d.ts files in ${directory}`);
  process.exitCode = problems.length === 0 && names.length > 0 ? 0 : 1;
}
/* v8 ignore stop */
