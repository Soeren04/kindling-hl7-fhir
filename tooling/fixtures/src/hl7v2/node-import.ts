import { readFileSync } from "node:fs";

export function readMessage(path: string): string {
  return readFileSync(path, "utf8");
}
