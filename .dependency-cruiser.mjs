// @ts-check
// Architecture boundaries of the library (ADR 0002). Paths are matched as `(^|/)src/<layer>/` so the same rules
// apply to packages/hl7-to-fhir/src and to the fixtures in tooling/fixtures/src that prove the rules fire.

/**
 * The FHIR R4 types: `import type ... from "fhir/r4"`, the module form of the @types/fhir dependency. The package
 * ships declarations only, which TypeScript finds in @types but enhanced-resolve cannot, so the import stays
 * unresolved here; the type check proves that it resolves, and `verbatimModuleSyntax` keeps it type-only.
 */
const fhirTypes = "^fhir/r4$";

/** @type {import("dependency-cruiser").IConfiguration} */
const configuration = {
  forbidden: [
    {
      name: "shared-is-self-contained",
      comment:
        "shared/ holds the building blocks every layer uses, so it depends on nothing else.",
      severity: "error",
      from: { path: "(^|/)src/shared/" },
      to: { pathNot: "(^|/)src/shared/" },
    },
    {
      name: "hl7v2-knows-no-fhir",
      comment:
        "The HL7 v2 layer is usable on its own: it may import only hl7v2/ and shared/.",
      severity: "error",
      from: { path: "(^|/)src/hl7v2/" },
      to: { pathNot: "(^|/)src/(hl7v2|shared)/" },
    },
    {
      name: "fhir-builds-on-hl7v2-only",
      comment:
        "The FHIR mapping may import only fhir/, hl7v2/, shared/ and the FHIR R4 types of @types/fhir; never the CLI.",
      severity: "error",
      from: { path: "(^|/)src/fhir/" },
      to: {
        pathNot: `(^|/)src/(fhir|hl7v2|shared)/|${fhirTypes}`,
      },
    },
    {
      name: "only-cli-uses-node",
      comment:
        "Only the CLI may use Node built-in modules; the library runs in browsers too.",
      severity: "error",
      from: { path: "(^|/)src/", pathNot: "(^|/)src/cli/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "nothing-imports-the-cli",
      comment:
        "The CLI is an application on top of the library, never a dependency of it.",
      severity: "error",
      from: { path: "(^|/)src/", pathNot: "(^|/)src/cli/" },
      to: { path: "(^|/)src/cli/" },
    },
    {
      name: "no-circular",
      comment:
        "Cycles make the layers impossible to reason about and to tree-shake.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolvable",
      comment:
        "Every import must resolve; a typo would otherwise only surface at build time. The FHIR layer is exempt because the FHIR types resolve for TypeScript only (see fhirTypes); there, fhir-builds-on-hl7v2-only flags every unresolved import but those types.",
      severity: "error",
      from: { pathNot: "(^|/)src/fhir/" },
      to: { couldNotResolve: true },
    },
    {
      name: "no-dev-dependencies-in-library",
      comment:
        "Library sources ship to users, so they must not import devDependencies.",
      severity: "error",
      from: { path: "(^|/)src/" },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "(^|/)node_modules/" },
    // Type-only imports count too: an hl7v2 module must not even mention FHIR types.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".js", ".mjs", ".json"],
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};

export default configuration;
