import { initialize } from "./initialize";

export { version } from "./initialize";
export * from "@galacean/engine-core";
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-null";

initialize();
