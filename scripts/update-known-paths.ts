// Rewrites the generated list of known paths; run by `pnpm update:known-paths`.
import { writeFileSync } from "node:fs";

import { knownPathsFile, knownPathsSource } from "./known-paths-source";

writeFileSync(knownPathsFile, knownPathsSource());
console.log(`Known paths: wrote ${knownPathsFile}.`);
