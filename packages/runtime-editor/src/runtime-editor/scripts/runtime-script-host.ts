import * as Engine from "@galacean/engine";
import * as WebGPU from "@galacean/engine-webgpu";
import * as WebGPURHI from "@galacean/engine-rhi-webgpu";
import * as WebGLRHI from "@galacean/engine-rhi-webgl";
import * as zod from "zod";
import * as ProjectAssets from "./project-assets";

/** Every package alias shares the running engine's class identities. */
export const runtimeScriptExternals: Readonly<Record<string, Record<string, unknown>>> = {
  "@galacean/editor-assets": ProjectAssets,
  zod,
  "@galacean/engine": Engine,
  "@galacean/engine-core": Engine,
  "@galacean/engine-math": Engine,
  "@galacean/engine-loader": Engine,
  "@galacean/engine-rhi-webgl": WebGLRHI,
  "@galacean/engine-webgpu": WebGPU,
  "@galacean/engine-rhi-webgpu": WebGPURHI
};
