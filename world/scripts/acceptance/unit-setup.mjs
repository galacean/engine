// Match the original gameplay test bootstrap; no Engine/GPU behavior is mocked.
if (!globalThis.window) Object.defineProperty(globalThis, "window", { value: {}, configurable: true, writable: true });

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(root, "world/package.json"));
globalThis.__migrationRepositoryRoot = root;
globalThis.__resolveMigrationImport = (specifier) => pathToFileURL(require.resolve(specifier));

// Persist the active test before a possible worker crash; console output may be buffered.
if (process.env.ACCEPTANCE_TRACE) {
  const { beforeEach } = await import("vitest");
  const fs = await import("node:fs");
  beforeEach((context) => fs.appendFileSync(process.env.ACCEPTANCE_TRACE, context.task.name + "\n"));
}
