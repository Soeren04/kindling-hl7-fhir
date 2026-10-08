// @ts-check
// Copies the repository-wide legal files and README into the package directory before `npm pack`/`npm publish`,
// so the published package carries them without keeping second copies in git.
import { copyFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
// Resolved from the repository root, not the working directory, so the script copies into the right place wherever
// it is started from.
const packageDirectory = path.join(repositoryRoot, "packages/hl7-to-fhir");

for (const file of ["LICENSE", "NOTICE", "README.md"]) {
  copyFileSync(
    path.join(repositoryRoot, file),
    path.join(packageDirectory, file),
  );
}
