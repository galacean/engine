import { registerSpineRuntime } from "@galacean/engine-spine";
import { Spine42Runtime } from "./Spine42Runtime";

// Self-register on import: `import "@galacean/engine-spine-core-4.2"` wires the 4.2 backend
// into the shared `@galacean/engine-spine` package.
registerSpineRuntime(new Spine42Runtime());

export { Spine42Runtime };

// Re-export the spine 4.2 runtime API. Power users that construct spine-core objects directly
// (custom attachments, manual skeleton parsing) import them from this core package.
export * from "@esotericsoftware/spine-core";

export const version = `__buildVersion`;
console.log(`Galacean spine-core-4.2 version: ${version}`);
