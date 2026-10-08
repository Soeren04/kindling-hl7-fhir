// @ts-check
// Evaluates the output of the official HL7 FHIR validator (`-output <file>`): fails on any error, and on any warning
// whose message id is not in the allowlist. Allowlist entries that no warning used fail too, so the list stays exact.
// Usage: node scripts/check-validator-results.mjs <validator-output.json> <validator-allowlist.json>
import { readFileSync } from "node:fs";

const messageIdExtension =
  "http://hl7.org/fhir/StructureDefinition/operationoutcome-message-id";
const fileExtension =
  "http://hl7.org/fhir/StructureDefinition/operationoutcome-file";

/**
 * @typedef {object} ValidatorIssue
 * @property {string} severity - `fatal`, `error`, `warning` or `information`.
 * @property {string} messageId - The validator's message id, or `<none>` when it reported none.
 * @property {string} file - The validated file, or `<unknown file>`.
 * @property {string} location - The FHIRPath of the offending element, or `<unknown location>`.
 * @property {string} text - The validator's description of the issue.
 */

/**
 * @typedef {object} AllowedWarning
 * @property {string} messageId - The exact message id of the accepted warning.
 * @property {string} reason - Why the warning does not indicate a defect.
 */

/**
 * Flattens the validator output, an OperationOutcome for one file or a Bundle of them for several, into issues.
 *
 * @param {unknown} output - The parsed JSON the validator wrote.
 * @returns {ValidatorIssue[]} Every issue the validator reported.
 * @throws {Error} When the output is not an OperationOutcome or a Bundle of them, or the Bundle is empty.
 */
export function collectIssues(output) {
  const outcomes = isResource(output, "Bundle")
    ? asArray(output["entry"]).map((entry) =>
        isRecord(entry) ? entry["resource"] : undefined,
      )
    : [output];
  // A run that validated nothing must not pass as a clean one.
  if (outcomes.length === 0)
    throw new Error("The validator output is a Bundle without entries");
  return outcomes.flatMap((outcome) => {
    if (!isResource(outcome, "OperationOutcome")) {
      throw new Error(
        "The validator output is neither an OperationOutcome nor a Bundle of them",
      );
    }
    const file = extensionValue(outcome, fileExtension) ?? "<unknown file>";
    return asArray(outcome["issue"])
      .filter(isRecord)
      .map((issue) => toValidatorIssue(issue, file));
  });
}

/**
 * Lists every reason why the validation run must fail.
 *
 * @param {readonly ValidatorIssue[]} issues - The issues the validator reported.
 * @param {readonly AllowedWarning[]} allowedWarnings - The accepted warnings.
 * @returns {string[]} The problems; empty when the run passes.
 */
export function findValidationProblems(issues, allowedWarnings) {
  const allowedIds = new Set(
    allowedWarnings.map((warning) => warning.messageId),
  );
  const usedIds = new Set();
  const problems = [];
  for (const issue of issues) {
    if (issue.severity === "warning" && allowedIds.has(issue.messageId)) {
      usedIds.add(issue.messageId);
    } else if (issue.severity !== "information") {
      problems.push(
        `${issue.severity} ${issue.messageId} in ${issue.file} at ${issue.location}: ${issue.text}`,
      );
    }
  }
  for (const id of allowedIds) {
    if (!usedIds.has(id))
      problems.push(
        `allowlisted warning ${id} no longer occurs; remove it from the allowlist`,
      );
  }
  return problems;
}

/**
 * Reads and checks the allowlist file.
 *
 * @param {unknown} allowlist - The parsed allowlist JSON.
 * @returns {AllowedWarning[]} The accepted warnings.
 */
export function parseAllowlist(allowlist) {
  const warnings = isRecord(allowlist) ? allowlist["warnings"] : undefined;
  if (!Array.isArray(warnings))
    throw new Error('The allowlist needs a "warnings" array');
  return warnings.map((/** @type {unknown} */ warning) => {
    if (
      !isRecord(warning) ||
      typeof warning["messageId"] !== "string" ||
      typeof warning["reason"] !== "string" ||
      warning["reason"].trim() === ""
    ) {
      throw new Error(
        "Every allowlisted warning needs a messageId and a non-empty reason",
      );
    }
    return { messageId: warning["messageId"], reason: warning["reason"] };
  });
}

/**
 * @param {Record<string, unknown>} issue
 * @param {string} file
 * @returns {ValidatorIssue}
 */
function toValidatorIssue(issue, file) {
  const [expression] = asArray(issue["expression"]);
  const [location] = asArray(issue["location"]);
  const details = isRecord(issue["details"])
    ? issue["details"]["text"]
    : undefined;
  return {
    severity:
      typeof issue["severity"] === "string"
        ? issue["severity"]
        : "<unknown severity>",
    messageId: extensionValue(issue, messageIdExtension) ?? "<none>",
    file,
    location: stringOr(expression, stringOr(location, "<unknown location>")),
    text: stringOr(issue["diagnostics"], stringOr(details, "")),
  };
}

/**
 * @param {Record<string, unknown>} element
 * @param {string} url
 * @returns {string | undefined}
 */
function extensionValue(element, url) {
  const extension = asArray(element["extension"]).find(
    (candidate) => isRecord(candidate) && candidate["url"] === url,
  );
  return isRecord(extension) && typeof extension["valueString"] === "string"
    ? extension["valueString"]
    : undefined;
}

/**
 * @param {unknown} value
 * @param {string} resourceType
 * @returns {value is Record<string, unknown>}
 */
function isResource(value, resourceType) {
  return isRecord(value) && value["resourceType"] === resourceType;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {readonly unknown[]}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function stringOr(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

// Exercised by spawning the script in the tests; V8 coverage cannot follow child processes.
/* v8 ignore start */
if (import.meta.main) {
  const [outputPath, allowlistPath] = process.argv.slice(2);
  if (outputPath === undefined || allowlistPath === undefined) {
    throw new Error(
      "Usage: check-validator-results.mjs <validator-output.json> <validator-allowlist.json>",
    );
  }
  const issues = collectIssues(JSON.parse(readFileSync(outputPath, "utf8")));
  const allowlist = parseAllowlist(
    JSON.parse(readFileSync(allowlistPath, "utf8")),
  );
  const problems = findValidationProblems(issues, allowlist);
  for (const problem of problems) console.error(problem);
  console.log(
    `FHIR validator: ${String(issues.length)} issue(s), ${String(problems.length)} problem(s).`,
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
