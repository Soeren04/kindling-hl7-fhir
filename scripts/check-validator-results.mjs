// @ts-check
// Evaluates the output of the official HL7 FHIR validator (`-output <file>`): fails on any error, and on any warning
// that no allowlist entry matches. An entry gives a message id, a substring of the issue text, a file, or a
// combination; the issue must match every key the entry gives. The text is the key that every validator version
// provides: only some versions write a message id. Allowlist entries that no warning matched fail too, so the list
// stays exact.
// Files passed after the allowlist must each have an outcome in the output, so a file the validator skipped cannot
// pass as a clean one.
// Usage: node scripts/check-validator-results.mjs <validator-output.json> <validator-allowlist.json> [validated file...]
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
 * An accepted warning. A warning matches when it satisfies every key the entry gives, and an entry gives at least one
 * of `messageId` and `text`. Message ids differ between validator versions (some write none), so prefer `text`.
 *
 * @typedef {object} AllowedWarning
 * @property {string | undefined} messageId - The exact message id of the accepted warning.
 * @property {string | undefined} text - A substring the issue text must contain.
 * @property {string | undefined} file - A path suffix, like `test/golden/a.json`, restricting the entry to that file.
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
  return collectOutcomes(output).flatMap((outcome) => {
    const file = extensionValue(outcome, fileExtension) ?? "<unknown file>";
    return asArray(outcome["issue"])
      .filter(isRecord)
      .map((issue) => toValidatorIssue(issue, file));
  });
}

/**
 * Lists the files the validator wrote an outcome for, as it names them.
 *
 * @param {unknown} output - The parsed JSON the validator wrote.
 * @returns {string[]} The file of every OperationOutcome that names one.
 * @throws {Error} When the output is not an OperationOutcome or a Bundle of them, or the Bundle is empty.
 */
export function collectValidatedFiles(output) {
  return collectOutcomes(output).flatMap((outcome) => {
    const file = extensionValue(outcome, fileExtension);
    return file === undefined ? [] : [file];
  });
}

/**
 * Lists the expected files without an outcome. The validator names a file as it was passed or by its absolute path,
 * so files are compared by their path relative to the end: `a/b.json` matches `/x/a/b.json`.
 *
 * @param {readonly string[]} validated - The files the validator wrote an outcome for.
 * @param {readonly string[]} expected - The files passed to the validator.
 * @returns {string[]} One problem per expected file without an outcome.
 */
export function findMissingFiles(validated, expected) {
  return expected
    .filter((file) => !validated.some((name) => endsWithPath(name, file)))
    .map((file) => `the validator output has no outcome for ${file}`);
}

/**
 * @param {unknown} output - The parsed JSON the validator wrote.
 * @returns {Record<string, unknown>[]} The OperationOutcomes, one per validated file.
 */
function collectOutcomes(output) {
  const outcomes = isResource(output, "Bundle")
    ? asArray(output["entry"]).map((entry) =>
        isRecord(entry) ? entry["resource"] : undefined,
      )
    : [output];
  // A run that validated nothing must not pass as a clean one.
  if (outcomes.length === 0)
    throw new Error("The validator output is a Bundle without entries");
  return outcomes.map((outcome) => {
    if (!isResource(outcome, "OperationOutcome")) {
      throw new Error(
        "The validator output is neither an OperationOutcome nor a Bundle of them",
      );
    }
    return outcome;
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
  const used = new Set();
  const problems = [];
  for (const issue of issues) {
    const matching =
      issue.severity === "warning"
        ? allowedWarnings.filter((allowed) => matchesWarning(allowed, issue))
        : [];
    if (matching.length > 0) {
      for (const allowed of matching) used.add(allowed);
    } else if (issue.severity !== "information") {
      problems.push(
        `${issue.severity} ${issue.messageId} in ${issue.file} at ${issue.location}: ${issue.text}`,
      );
    }
  }
  for (const allowed of allowedWarnings) {
    if (!used.has(allowed))
      problems.push(
        `allowlisted warning (${describeEntry(allowed)}) no longer occurs; remove it from the allowlist`,
      );
  }
  return problems;
}

/**
 * Reads and checks the allowlist file.
 *
 * @param {unknown} allowlist - The parsed allowlist JSON.
 * @returns {AllowedWarning[]} The accepted warnings.
 * @throws {Error} When the allowlist has no `warnings` array, or an entry lacks a reason or any of `messageId` and
 * `text`, or gives a key as anything but a non-empty string.
 */
export function parseAllowlist(allowlist) {
  const warnings = isRecord(allowlist) ? allowlist["warnings"] : undefined;
  if (!Array.isArray(warnings))
    throw new Error('The allowlist needs a "warnings" array');
  return warnings.map((/** @type {unknown} */ warning) => {
    if (!isRecord(warning)) {
      throw new Error("Every allowlisted warning must be an object");
    }
    const messageId = optionalKey(warning, "messageId");
    const text = optionalKey(warning, "text");
    const file = optionalKey(warning, "file");
    const reason = warning["reason"];
    if (messageId === undefined && text === undefined) {
      throw new Error(
        "Every allowlisted warning needs a messageId or a text to match",
      );
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error("Every allowlisted warning needs a non-empty reason");
    }
    return { messageId, text, file, reason };
  });
}

/**
 * @param {AllowedWarning} allowed
 * @param {ValidatorIssue} issue
 * @returns {boolean}
 */
function matchesWarning(allowed, issue) {
  return (
    (allowed.messageId === undefined ||
      allowed.messageId === issue.messageId) &&
    (allowed.text === undefined || issue.text.includes(allowed.text)) &&
    (allowed.file === undefined || endsWithPath(issue.file, allowed.file))
  );
}

/**
 * @param {AllowedWarning} allowed
 * @returns {string}
 */
function describeEntry(allowed) {
  return [
    allowed.messageId === undefined ? [] : [`messageId ${allowed.messageId}`],
    allowed.text === undefined ? [] : [`text "${allowed.text}"`],
    allowed.file === undefined ? [] : [`file ${allowed.file}`],
  ]
    .flat()
    .join(", ");
}

/**
 * The validator names a file as it was passed or by its absolute path, so paths are compared by their end:
 * `a/b.json` matches `/x/a/b.json`, but `b.json` does not match `ab.json`.
 *
 * @param {string} path - The path as the validator wrote it.
 * @param {string} suffix - The path, or the end of it, to look for.
 * @returns {boolean}
 */
function endsWithPath(path, suffix) {
  const normalized = path.replaceAll("\\", "/");
  return normalized === suffix || normalized.endsWith(`/${suffix}`);
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string} key
 * @returns {string | undefined} The value, or undefined when the entry does not give the key.
 */
function optionalKey(entry, key) {
  const value = entry[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") {
    throw new Error(`The allowlist key "${key}" must be a non-empty string`);
  }
  return value;
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
  const [outputPath, allowlistPath, ...expectedFiles] = process.argv.slice(2);
  if (outputPath === undefined || allowlistPath === undefined) {
    throw new Error(
      "Usage: check-validator-results.mjs <validator-output.json> <validator-allowlist.json> [validated file...]",
    );
  }
  /** @type {unknown} */
  const output = JSON.parse(readFileSync(outputPath, "utf8"));
  const issues = collectIssues(output);
  const allowlist = parseAllowlist(
    JSON.parse(readFileSync(allowlistPath, "utf8")),
  );
  const problems = [
    ...findMissingFiles(collectValidatedFiles(output), expectedFiles),
    ...findValidationProblems(issues, allowlist),
  ];
  for (const problem of problems) console.error(problem);
  console.log(
    `FHIR validator: ${String(issues.length)} issue(s), ${String(problems.length)} problem(s).`,
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
