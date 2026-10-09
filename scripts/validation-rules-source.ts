// Generates docs/validation-rules.md, the table of validation rules and issue codes, from the rule metadata of the
// library; `pnpm update:validation-rules` writes it, and a test fails when the committed file differs.
import { format } from "prettier";

import { validationRules } from "../packages/hl7-to-fhir/src/hl7v2/validate/catalog";
import type { RuleDescription } from "../packages/hl7-to-fhir/src/hl7v2/validate/rule";
import type { IssueCode } from "../packages/hl7-to-fhir/src/shared/issue";
import { issueDefinitions } from "../packages/hl7-to-fhir/src/shared/issue-table";

/** Where the generated page lives, relative to the repository root. */
export const validationRulesFile = "docs/validation-rules.md";

/** A table cell: pipes and line breaks would end the cell or the row. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function table(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const line = (cells: readonly string[]): string =>
    `| ${cells.map(cell).join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

const scopes: Readonly<Record<RuleDescription["scope"], string>> = {
  "every message": "every message",
  "version 2.5":
    "messages of version 2.5 and 2.5.x, and messages without version",
  "version 2.5 and caller definitions":
    "segments with a definition; the built-in definitions in version 2.5 and 2.5.x only, those passed in always",
};

function codeList(codes: readonly IssueCode[]): string {
  return codes.map((code) => `\`${code}\``).join(", ");
}

/** The documentation page, before formatting. */
function page(): string {
  const rules = validationRules
    .map(
      ({ name, summary, scope, codes }) =>
        `### \`${name}\`\n\n${summary}\n\n- Applies to: ${scopes[scope]}.\n- Codes: ${codeList(codes)}.`,
    )
    .join("\n\n");
  const codes = table(
    ["Code", "Severity", "Rule", "Message"],
    validationRules.flatMap(({ name, codes: ruleCodes }) =>
      ruleCodes.map((code) => {
        const { severity, message } = issueDefinitions[code];
        return [`\`${code}\``, severity, `\`${name}\``, message];
      }),
    ),
  );
  return `# Validation rules

<!-- Generated from the rule metadata in packages/hl7-to-fhir/src/hl7v2/validate/rules by
\`pnpm update:validation-rules\`; do not edit it by hand. A test fails when this file differs from the rules. -->

\`validate\` from \`hl7-to-fhir/hl7v2\` applies these rules in this order and returns every finding as an issue. Each
code always has the severity and the message listed here; the message never contains message content, and the value
a finding is about is in the issue's \`value\`, which may contain patient data and should not be logged. \`group\`
applies the rules up to \`segment-order\` too. The issues of parsing are documented with \`IssueCode\`.

## Rules

${rules}

## Codes

${codes}
`;
}

/**
 * Renders the text of the rules page, formatted the way Prettier formats Markdown.
 *
 * @returns The complete file content.
 */
export async function validationRulesSource(): Promise<string> {
  return format(page(), { parser: "markdown" });
}
