// Rewrites the generated table of validation rules; run by `pnpm update:validation-rules`.
import { writeFileSync } from "node:fs";

import {
  validationRulesFile,
  validationRulesSource,
} from "./validation-rules-source";

writeFileSync(validationRulesFile, await validationRulesSource());
console.log(`Validation rules: wrote ${validationRulesFile}.`);
