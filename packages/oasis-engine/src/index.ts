import * as CoreObjects from "@oasis-engine/core";
import { Loader } from "@oasis-engine/core";
for (let key in CoreObjects) {
  Loader.register(key, CoreObjects[key]);
}

//@ts-ignore
export const version = `__buildVersion`;

export * from "@oasis-engine/core";
export * from "@oasis-engine/loader";
export * from "@oasis-engine/math";
export * from "@oasis-engine/rhi-webgl";

console.log(`oasis engine version: ${version}`);
