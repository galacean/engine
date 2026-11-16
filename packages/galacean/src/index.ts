import { Polyfill } from "@galacean/engine-core";
import { initialize } from "./initialize";
//@ts-ignore
export const version = `__buildVersion`;

console.log(`Galacean Engine Version: ${version}`);

export * from "@galacean/engine-core";
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-webgl";

Polyfill.registerPolyfill();
initialize();
