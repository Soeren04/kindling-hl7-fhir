import { dataTypes } from "../packages/hl7-to-fhir/src/hl7v2/definitions/data-types";
import { segmentDefinitions } from "../packages/hl7-to-fhir/src/hl7v2/definitions/segment-definitions";

/** Where the generated file lives, relative to the repository root. */
export const knownPathsFile = "packages/hl7-to-fhir/src/hl7v2/known-paths.ts";

/**
 * Lists every field (`PID.5`) and every component of a composite field (`PID.5.1`) of the defined segments.
 *
 * @returns The paths in definition order, each once.
 */
export function knownPaths(): readonly string[] {
  return [...segmentDefinitions.values()].flatMap((segment) =>
    segment.fields.flatMap(({ position, dataType }) => {
      const fieldPath = `${segment.id}.${String(position)}`;
      const type = dataTypes.get(dataType);
      const components = type?.kind === "composite" ? type.components : [];
      return [
        fieldPath,
        ...components.map((part) => `${fieldPath}.${String(part.position)}`),
      ];
    }),
  );
}

/**
 * Renders the text of `known-paths.ts`, laid out the way Prettier formats it.
 *
 * @returns The complete file content.
 */
export function knownPathsSource(): string {
  const members = knownPaths().map((path) => `  | "${path}"`);
  return `// Generated from the segment and data type definitions by \`pnpm update:known-paths\`; do not edit.
// A test fails when this file differs from the definitions.

/**
 * Every field and component of the segments the library defines, in HL7 notation: \`PID.5\` and \`PID.5.1\`.
 * Editors offer these when a path is typed; \`get\`, \`getAll\` and \`isNull\` accept any other well-formed path as well.
 *
 * @example
 * \`\`\`ts
 * import type { KnownPath } from "hl7-to-fhir/hl7v2";
 *
 * const name: KnownPath = "PID.5.1";
 * \`\`\`
 */
export type KnownPath =
${members.join("\n")};
`;
}
