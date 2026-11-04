import path from "node:path";
import { fileURLToPath } from "node:url";
import worldConfig from "../../vite.config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default {
  ...worldConfig,
  root: path.join(root, "world/tests/seed-world"),
  test: {
    environment: "node",
    include: ["*.spec.ts"],
    setupFiles: [
      path.join(root, "world/scripts/acceptance/unit-setup.mjs"),
      path.join(root, "world/tests/seed-world/SeedWorldProjectTestSetup.ts")
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15000
  }
};
