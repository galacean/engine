import { ShaderMacroProcessor } from "@galacean/engine-core";
import {
  finalizeShaderUniforms,
  type IShaderUniformSelection,
  type IShaderInfo,
  type IWebGPUShaderCompiler,
  type IWebGPUShaderOptions,
  type IWebGPUShaderProgram
} from "@galacean/engine-design";
import { WGSLBackend } from "./webgpu/WGSLBackend";
import { recoverLegacyInstancing } from "./webgpu/UniformDeclarations";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";

/** Compile an instruction-based pass for a concrete macro set and vertex layout. */
export function compileWebGPUShaderPass(
  compiler: Pick<IWebGPUShaderCompiler, "compileWebGPUVariant">,
  pass: Pick<IShaderInfo, "uniformBlocks" | "uniformPlan" | "vertexShaderInstructions" | "fragmentShaderInstructions">,
  features: ReadonlyMap<string, string> = new Map(),
  options: IWebGPUShaderOptions = {}
): IWebGPUShaderProgram {
  const macros = new Map(ShaderMacroProcessor._defaultWebGPUMacros);
  features.forEach((value, name) => macros.set(name, value));
  const vs: IShaderUniformSelection[] = [],
    fs: IShaderUniformSelection[] = [];
  const vertex = pass.vertexShaderInstructions!,
    fragment = pass.fragmentShaderInstructions!;
  const v = ShaderMacroProcessor.evaluate(
    pass.uniformPlan ? vertex : ShaderInstructionEncoder.normalizeRawStage(vertex),
    macros,
    pass.uniformPlan?.vertex,
    vs
  );
  const f = ShaderMacroProcessor.evaluate(
    pass.uniformPlan ? fragment : ShaderInstructionEncoder.normalizeRawStage(fragment),
    macros,
    pass.uniformPlan?.fragment,
    fs
  );
  const legacyInstances = !pass.uniformPlan && macros.has("RENDERER_GPU_INSTANCE");
  const variant = legacyInstances
    ? recoverLegacyInstancing(v, f, pass.uniformBlocks?.length ?? 0, options.maxUniformBlockBytes ?? 16384)
    : finalizeShaderUniforms(v, f, vs, fs, {
        maxBlockBytes: options.maxUniformBlockBytes ?? 16384,
        maxBindings: 24,
        explicitBlocks: pass.uniformBlocks?.length,
        instancing: macros.has("RENDERER_GPU_INSTANCE") ? pass.uniformPlan?.instancing : undefined
      });
  if (variant.instanceOverflow) throw new Error("The selected instance does not fit a uniform buffer binding.");
  const i = variant.instanceLayout;
  return compiler.compileWebGPUVariant(variant.vertexSource, variant.fragmentSource, {
    ...options,
    uniformBlocks: [...(pass.uniformBlocks ?? []), ...variant.uniformBlocks],
    instanceBindingName: i?.bindingName,
    instanceByteLength: i ? i.headerBytes + i.structSize * i.instanceMaxCount : undefined
  });
}

/** Create the pure-TypeScript AST-based WebGPU WGSL compiler (zero external WASM). */
export function createWebGPUShaderCompilerSync(): IWebGPUShaderCompiler {
  const backend = new WGSLBackend();
  return {
    recoverLegacyInstancing,
    normalizeRawStage: ShaderInstructionEncoder.normalizeRawStage,
    compileWebGPUVariant: backend.compileWebGPUVariant.bind(backend),
    compileDefaultVariant(program: IShaderInfo) {
      return compileWebGPUShaderPass(backend, program);
    }
  };
}

/** Create the pure-TypeScript AST-based WebGPU WGSL compiler. */
export function createWebGPUShaderCompiler(): Promise<IWebGPUShaderCompiler> {
  return Promise.resolve(createWebGPUShaderCompilerSync());
}
