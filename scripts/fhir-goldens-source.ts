import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";

import {
  convert,
  type ConvertOptions,
  type Issue,
  sequentialIds,
} from "../packages/hl7-to-fhir/src/index";
import { splitBatch } from "../packages/hl7-to-fhir/src/hl7v2/batch";

/** Where the samples are, relative to the repository root. */
const samplesDirectory = "samples";

/** Where the generated golden files live, relative to the repository root; the FHIR validator checks its bundles. */
export const fhirGoldenDirectory = "packages/hl7-to-fhir/test/golden/fhir";

/** One conversion that has golden files: its name, the message and the options. */
interface GoldenCase {
  /** The base name of its golden files, such as `adt-a01` or `batch.2`. */
  readonly name: string;
  readonly input: string;
  readonly options: ConvertOptions;
}

/**
 * The conversions with golden files: every message of every sample, with ids from `sequentialIds` so the bundles are
 * the same on every run, and the ADT sample once more as a transaction. A batch file gives one case per message,
 * numbered from 1.
 */
function goldenCases(root: string): GoldenCase[] {
  const directory = path.join(root, samplesDirectory);
  const samples = readdirSync(directory)
    .filter((name) => name.endsWith(".hl7"))
    .sort();
  return samples.flatMap((file) => {
    const sample = path.basename(file, ".hl7");
    const text = readFileSync(path.join(directory, file), "utf8");
    const { messages } = splitBatch(text);
    const named = messages.map((input, index) => ({
      name: messages.length === 1 ? sample : `${sample}.${String(index + 1)}`,
      input,
    }));
    const cases = named.map(({ name, input }) => ({
      name,
      input,
      options: { ids: sequentialIds(name) },
    }));
    if (sample !== "adt-a01") return cases;
    const transaction = `${sample}.transaction`;
    return [
      ...cases,
      {
        name: transaction,
        input: text,
        options: { ids: sequentialIds(transaction), bundleType: "transaction" },
      },
    ];
  });
}

/**
 * The golden files of every case, by file name: `<name>.bundle.json`, the bundle as Prettier formats it, and
 * `<name>.issues.txt`, one line per issue; or `<name>.failure.txt` for a conversion that fails.
 */
export async function fhirGoldens(root: string): Promise<Map<string, string>> {
  const config = await resolveConfig(
    path.join(root, fhirGoldenDirectory, "x.json"),
  );
  const files = new Map<string, string>();
  for (const { name, input, options } of goldenCases(root)) {
    const result = convert(input, options);
    if (result.ok) {
      const json = JSON.stringify(result.value.bundle);
      files.set(
        `${name}.bundle.json`,
        await format(json, { ...config, parser: "json" }),
      );
      files.set(`${name}.issues.txt`, issueLines(result.value.issues));
    } else {
      const { code, message, issues } = result.error;
      files.set(
        `${name}.failure.txt`,
        `${code}: ${message}\n${issueLines(issues)}`,
      );
    }
  }
  return files;
}

/** One line per issue: severity, code, where (`PID-7[1].1`) and the value, or a line saying there is none. */
function issueLines(issues: readonly Issue[]): string {
  if (issues.length === 0) return "No issues.\n";
  return issues
    .map(({ severity, code, location, value }) => {
      const { segmentId, field, repetition, component, subcomponent } =
        location;
      const where = [
        segmentId ?? "",
        field === undefined ? "" : `-${String(field)}`,
        repetition === undefined ? "" : `[${String(repetition)}]`,
        component === undefined ? "" : `.${String(component)}`,
        subcomponent === undefined ? "" : `.${String(subcomponent)}`,
      ].join("");
      const at = where === "" ? `@${String(location.span.start)}` : where;
      const raw = value === undefined ? "" : ` ${JSON.stringify(value)}`;
      return `${severity} ${code} ${at}${raw}\n`;
    })
    .join("");
}
