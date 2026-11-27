import { RHIMode, type Engine, type EngineConfiguration } from "@galacean/engine-core";

/** Resolve the product URL preference shared by the Seed world and its planning viewport. */
export function seedWorldRhi(url: URL): RHIMode {
  const rhi = url.searchParams.get("rhi") ?? RHIMode.Auto;
  if (rhi === RHIMode.Auto || rhi === RHIMode.WebGPU || rhi === RHIMode.WebGL2) return rhi;
  throw new Error("rhi must be auto, webgpu or webgl2");
}

/** Create the requested renderer for a Seed world or its planning viewport. */
export function createWorldEngine(
  options: EngineConfiguration & { canvas: HTMLCanvasElement | OffscreenCanvas | string; rhi?: RHIMode }
): Promise<Engine> {
  const { rhi = RHIMode.Auto, ...configuration } = options;
  const createWebGL2 = (): Promise<Engine> =>
    Promise.all([import("@galacean/engine"), import("@galacean/engine-shader-compiler")]).then(
      ([{ WebGLEngine }, { ShaderCompiler }]) =>
        WebGLEngine.create({ ...configuration, shaderCompiler: configuration.shaderCompiler ?? new ShaderCompiler() })
    );
  if (rhi === RHIMode.WebGPU || (rhi === RHIMode.Auto && globalThis.navigator?.gpu)) {
    return import("@galacean/engine-webgpu").then(({ WebGPUEngine, WebGPUDeviceUnavailableError }) =>
      WebGPUEngine.create(configuration).catch((error) => {
        if (rhi === RHIMode.Auto && error instanceof WebGPUDeviceUnavailableError) return createWebGL2();
        throw error;
      })
    );
  }
  return createWebGL2();
}
