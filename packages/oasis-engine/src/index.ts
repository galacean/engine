import * as CoreObjects from "@oasis-engine/core";
import { Loader } from "@oasis-engine/core";
//@ts-ignore
export const version = `__buildVersion`;

console.log(`oasis engine version: ${version}`);

export * from "@oasis-engine/core";
export * from "@oasis-engine/loader";
export * from "@oasis-engine/math";
export * from "@oasis-engine/rhi-webgl";

for (let key in CoreObjects) {
  Loader.registerClass(key, CoreObjects[key]);
}
