import { fileURLToPath } from "node:url";
import config from "../seed-world/vitest.config.mjs";

export default {
  ...config,
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { ...config.test, name: "@galacean/procedural-rock-tests" }
};
