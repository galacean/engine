import { registerSpineRuntime } from "@galacean/engine-spine";
import { Spine38Runtime } from "./Spine38Runtime";

registerSpineRuntime(new Spine38Runtime());

export { Spine38Runtime };

// Re-export the vendored spine 3.8 runtime API. Power users that construct spine-core objects
// directly (custom attachments, manual skeleton parsing) import them from this core package.
export * from "./spine-core";

export const version = `__buildVersion`;
console.log(`Galacean spine-core-3.8 version: ${version}`);
