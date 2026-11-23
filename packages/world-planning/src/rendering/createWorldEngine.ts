import { RHIMode, type Engine, type EngineConfiguration } from "@galacean/engine-core";

/** Resolve the product URL preference shared by the Seed world and its planning viewport. */
export function seedWorldRhi(url: URL): RHIMode {
  const rhi = url.searchParams.get("rhi") ?? RHIMode.Auto;
  if (rhi === RHIMode.Auto || rhi === RHIMode.WebGPU || rhi === RHIMode.WebGL2) return rhi;
  throw new Error("rhi must be auto, webgpu or webgl2");
}

/** Create the requested renderer for a Seed world or its planning viewport. */
export async function createWorldEngine(
  options: EngineConfiguration & { canvas: HTMLCanvasElement | OffscreenCanvas | string; rhi?: RHIMode }
): Promise<Engine> {
  const { rhi = RHIMode.Auto, ...configuration } = options;
  if (rhi === RHIMode.WebGPU || (rhi === RHIMode.Auto && globalThis.navigator?.gpu)) {
    const { WebGPUEngine, WebGPUDeviceUnavailableError } = await import("@galacean/engine-webgpu");
    try {
      return await WebGPUEngine.create(configuration);
    } catch (error) {
      if (rhi !== RHIMode.Auto || !(error instanceof WebGPUDeviceUnavailableError)) throw error;
    }
  }

  const [{ WebGLEngine }, { ShaderCompiler }] = await Promise.all([
    import("@galacean/engine"),
    import("@galacean/engine-shader-compiler")
  ]);
  return WebGLEngine.create({ ...configuration, shaderCompiler: configuration.shaderCompiler ?? new ShaderCompiler() });
}
