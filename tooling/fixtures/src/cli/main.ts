import { readFileSync } from "node:fs";

/**
 * Reads the file named by the first command-line argument.
 *
 * @returns The file content.
 */
export function readInput(): string {
  return readFileSync(process.argv[2] ?? "-", "utf8");
}
