import path from "node:path";
import { fileURLToPath } from "node:url";
import worldConfig from "../../vite.config.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
export default {
  ...worldConfig,
  root,
  test: {
    name: "farming-migration",
    environment: "node",
    include: ["*.spec.ts"],
    setupFiles: [path.resolve(root, "../../scripts/acceptance/unit-setup.mjs")],
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 30000
  }
};
