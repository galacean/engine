import type { RuntimeScriptModule } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment";
import * as runtime from "./runtime.ts";
import declarations from "./runtime-declarations.json";

/** Preset host capabilities. No system-specific branch belongs in the compiler or Editor. */
export const seedWorldScriptModules: readonly RuntimeScriptModule[] = [
  {
    name: "@galacean/seed-world-systems",
    exports: runtime,
    declarations
  }
];
