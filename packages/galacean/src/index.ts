import * as CoreObjects from "@galacean/engine-core";
import { Loader, Polyfill, SystemInfo } from "@galacean/engine-core";
import { ShaderPool } from "./ShaderPool";

export const version = `__buildVersion`;

console.log(`Galacean Engine Version: ${version}`);

export * from "@galacean/engine-core";
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-webgl";

for (const [key, value] of Object.entries(CoreObjects)) {
  Loader.registerClass(key, value);
}

// Bootstrap the Galacean engine flavor: browser polyfills first (must
// patch globals before anything else runs), then platform detection
// (other modules may read `SystemInfo.platform`), then built-in shader
// registration (so `Shader.find` returns the bundled shaders before any
// `Material` / `PostProcessPass` constructor calls it).
//
// Keeping these here rather than inside `engine-core` lets `engine-core`
// stay flavor-agnostic (no top-level browser side effects, no built-in
// shader bundle dependency), which in turn lets the offline shader
// compiler import core's enums without dragging the full runtime closure.
Polyfill.registerPolyfill();
// @ts-expect-error — `_initialize` is `SystemInfo` @internal.
SystemInfo._initialize();
ShaderPool.init();
ShaderPool.registerShaders();
