import { packageTestConfig } from "../../vitest.world-package.mjs";

const config = packageTestConfig("modify", "@galacean/engine-modify");
// GPU tests retain their separate browser configuration in tests/vitest.config.mjs.
config.test.include = ["tests/**/*.spec.ts"];
export default config;
