import * as CoreObjects from "@galacean/engine-core";
import { Loader } from "@galacean/engine-core";
//@ts-ignore
export const version = `__buildVersion`;

console.log(`Galacean engine version: ${version}`);

export * from "@galacean/engine-core";
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-webgl";

for (let key in CoreObjects) {
  Loader.registerClass(key, CoreObjects[key]);
}
