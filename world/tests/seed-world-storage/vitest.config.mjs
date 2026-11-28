import { fileURLToPath } from "node:url";
import worldConfig from "../../scripts/acceptance/seed-world-fixes.config.mjs";

export default {
  ...worldConfig,
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { ...worldConfig.test, name: "@galacean/world-storage-tests" }
};
