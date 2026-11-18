import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const variant = process.argv[2] || "migrated";
const groups = process.argv.slice(3);
for (const group of groups) {
  const log = fs.openSync(path.join(root, `world/.acceptance/logs/${variant}-${group}-unit.log`), "w");
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--config",
        path.join(root, "world/scripts/acceptance/unit.config.mjs")
      ],
      {
        cwd:
          variant === "baseline"
            ? path.resolve(root, "../engine-next/world/.materialized/engine/world-gallery")
            : path.join(root, "world/.acceptance/tests"),
        env: { ...process.env, TEST_VARIANT: variant, TEST_GROUP: group },
        stdio: ["ignore", log, log]
      }
    );
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  fs.closeSync(log);
  console.log(variant, group, JSON.stringify(result));
}
