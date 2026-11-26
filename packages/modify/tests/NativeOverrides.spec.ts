import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("inherits native files when the replacement would have identical content", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const overrides: { original: string; replacement: string }[] = JSON.parse(
    readFileSync(resolve(root, "packages/modify/native-overrides.json"), "utf8")
  );
  const duplicates = overrides.filter(({ original, replacement }) => {
    const nativePath = resolve(root, original);
    const bytes = readFileSync(resolve(root, replacement));
    return existsSync(nativePath) && readFileSync(nativePath).equals(bytes);
  });
  expect(duplicates.map(({ original }) => original)).toEqual([]);
});
