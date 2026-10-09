// @ts-check
import { builtinModules } from "node:module";

import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import regexp from "eslint-plugin-regexp";
import tsdoc from "eslint-plugin-tsdoc";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/** Library sources, plus the tooling fixtures that prove the library rules fire. */
const librarySources = [
  "packages/hl7-to-fhir/src/**/*.ts",
  "tooling/fixtures/src/**/*.ts",
];

/**
 * Code that must run unchanged in browsers, Node and serverless runtimes: everything except the CLI.
 * Path patterns (not package paths) so the tooling fixtures match as well.
 */
const portableSources = [
  "**/src/*.ts",
  "**/src/shared/**/*.ts",
  "**/src/hl7v2/**/*.ts",
  "**/src/fhir/**/*.ts",
];

const runtimeSpecificMessage =
  "Only src/cli/** may depend on a specific runtime; the library must run in browsers and Node alike.";

const runtimeSpecificGlobals = [
  "process",
  "Buffer",
  "global",
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "self",
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "setImmediate",
  "clearImmediate",
].map((name) => ({ name, message: runtimeSpecificMessage }));

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/coverage/",
    "**/node_modules/",
    // The API report: build output committed for review (ADR 0007).
    "packages/hl7-to-fhir/api/",
    // Deliberately broken code; linted by the tooling tests with `ignore: false`.
    "tooling/fixtures/",
    // A consumer project that imports the package by name, which resolves only once it is installed; compiled by
    // test/consumer.test.ts and the Consumer job of CI.
    "packages/hl7-to-fhir/test/consumer/",
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript checks every file (JavaScript via checkJs) and knows the globals of each environment.
      "no-undef": "off",
      eqeqeq: "error",
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "xxx", "hack"], location: "anywhere" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  regexp.configs["flat/recommended"],
  {
    rules: {
      // The recommended preset already enables no-super-linear-backtracking; this one is the stricter companion.
      "regexp/no-super-linear-move": "error",
    },
  },
  {
    files: librarySources,
    plugins: { tsdoc },
    rules: {
      "tsdoc/syntax": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ClassDeclaration, ClassExpression",
          message: "Use plain readonly data and functions instead of classes.",
        },
      ],
    },
  },
  {
    files: portableSources,
    rules: {
      "no-console": "error",
      "no-restricted-globals": ["error", ...runtimeSpecificGlobals],
      "no-restricted-imports": [
        "error",
        {
          paths: builtinModules.map((name) => ({
            name,
            message: runtimeSpecificMessage,
          })),
          patterns: [{ group: ["node:*"], message: runtimeSpecificMessage }],
        },
      ],
    },
  },
  prettier,
);
