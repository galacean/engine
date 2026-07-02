import type { ISpineRuntime } from "@galacean/engine-spine";
import { registerSpineRuntime } from "@galacean/engine-spine";
import { Spine38Runtime } from "./Spine38Runtime";

// Self-register on import: `import "@galacean/engine-spine-core-3.8"` wires the 3.8 backend
// into the shared `@galacean/engine-spine` package. Cast needed because Spine38Runtime doesn't
// `implements ISpineRuntime` at the type level — see the class doc comment for why.
registerSpineRuntime(new Spine38Runtime() as unknown as ISpineRuntime);

export { Spine38Runtime };

// Re-export the vendored spine 3.8 runtime API. Power users that construct spine-core objects
// directly (custom attachments, manual skeleton parsing) import them from this core package.
export * from "./spine-core";

export const version = `__buildVersion`;
console.log(`Galacean spine-core-3.8 version: ${version}`);
