import path from "node:path";
import { fileURLToPath } from "node:url";
import worldConfig from "./world/vite.config.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Tests in a World system package run against the same modified Engine as World. */
export function packageTestConfig(directory, name) {
  return {
    ...worldConfig,
    root: path.join(root, "packages", directory),
    test: {
      name,
      environment: "node",
      include: ["tests/**/*.{spec,test}.{ts,mjs}"],
      setupFiles: [path.join(root, "world/scripts/acceptance/unit-setup.mjs")],
      fileParallelism: false,
      maxWorkers: 1,
      // The root entry ignores maxWorkers in a project. A single fork keeps these files serial there too.
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 30000,
      hookTimeout: 30000
    }
  };
}
