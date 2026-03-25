import { readFileSync } from "node:fs";

export function loadBinaryFile(path: string) {
  return readFileSync(path);
}
