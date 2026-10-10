// Rewrites the FHIR golden files from the samples; run by `pnpm update:fhir-goldens`. Review the diff like code.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fhirGoldenDirectory, fhirGoldens } from "./fhir-goldens-source";

const root = process.cwd();
const directory = path.join(root, fhirGoldenDirectory);
const files = await fhirGoldens(root);
mkdirSync(directory, { recursive: true });
// Files of cases that no longer exist would otherwise stay and be validated.
for (const name of readdirSync(directory)) {
  if (!files.has(name)) rmSync(path.join(directory, name));
}
for (const [name, content] of files) {
  writeFileSync(path.join(directory, name), content);
}
console.log(
  `FHIR goldens: wrote ${String(files.size)} files to ${fhirGoldenDirectory}.`,
);
