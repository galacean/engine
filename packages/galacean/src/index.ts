import { Polyfill } from "@galacean/engine-core";
import { initialize, version } from "./initialize";

export { version };

console.log(`Galacean Engine Version: ${version}`);

export * from "@galacean/engine-core";
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-webgl";

Polyfill.registerPolyfill();
initialize();
