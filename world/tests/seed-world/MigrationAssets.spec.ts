import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/acceptance/check-assets.mjs");

// A file deleted from the repository must also leave the migration map and the resource
// manifests, or the migration acceptance finds it missing.
it("finds every migrated file and manifest resource in the repository", () => {
  const output = execFileSync(process.execPath, [script], { encoding: "utf8" });
  expect(output).toMatch(/migration destinations and \d+ resource paths across \d+ manifests exist/);
});
