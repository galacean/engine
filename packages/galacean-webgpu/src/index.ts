import * as Core from "@galacean/engine-core";
import { graphicsCapabilities } from "../../galacean/src/graphicsCapabilities.js";
import { WebGPUEngine as PlatformEngine, WebGPUEngineConfiguration } from "@galacean/engine-rhi-webgpu";
import * as sources from "@galacean/engine-shader/webgpu";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { createWebGPUShaderCompiler } from "@galacean/engine-shader-compiler/webgpu";

export * from "@galacean/engine-core";
export type Engine = Core.Engine;
export const Engine: typeof Core.Engine & Core.EngineGraphicsCapabilities = Object.assign(
  Core.Engine,
  graphicsCapabilities
);
export * from "@galacean/engine-loader";
export * from "@galacean/engine-math";
export * from "@galacean/engine-rhi-webgpu";

export const version = "__buildVersion";
for (const name in Core) Core.Loader.registerClass(name, Core[name]);
Core.Polyfill.registerPolyfill();
Core.SystemInfo._initialize();
let builtinShaders: Core.BuiltinShaders;

/** Browser engine with the WebGPU runtime and its matching built-in shaders. */
export class WebGPUEngine extends PlatformEngine {
  private static _compiler?: ReturnType<typeof createWebGPUShaderCompiler>;

  protected static override _prepareConfiguration(
    configuration: WebGPUEngineConfiguration
  ): Promise<WebGPUEngineConfiguration> {
    const compiler = configuration.webGPUShaderCompiler
      ? Promise.resolve(configuration.webGPUShaderCompiler)
      : (this._compiler ??= createWebGPUShaderCompiler().catch((error) => {
          this._compiler = undefined;
          throw error;
        }));
    return compiler.then((webGPUShaderCompiler) => ({
      ...configuration,
      builtinShaderIncludes: sources.shaderLibrary,
      webGPUShaderCompiler,
      shaderCompiler: configuration.shaderCompiler ?? new ShaderCompiler(webGPUShaderCompiler),
      builtinShaders: configuration.builtinShaders ?? (builtinShaders ??= Core.createBuiltinShaders(sources))
    }));
  }
}
