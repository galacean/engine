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
import type { InitInput } from "web-naga";

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

/** Load the WGSL translator only for applications or offline builds that request WebGPU. */
export function createWebGPUShaderCompiler(moduleOrPath?: InitInput): Promise<IWebGPUShaderCompiler> {
  return import("web-naga").then((naga) =>
    naga.default(moduleOrPath ? { module_or_path: moduleOrPath } : undefined).then(() => {
      const backend = new WGSLBackend((source, stage) => {
        const frontend = naga.GlslFrontend.new();
        try {
          const module = frontend.parse(
            source,
            stage === "vertex" ? naga.ShaderStage.Vertex : naga.ShaderStage.Fragment
          );
          try {
            return module.to_wgsl();
          } finally {
            module.free();
          }
        } finally {
          frontend.free();
        }
      });
      return {
        recoverLegacyInstancing,
        normalizeRawStage: ShaderInstructionEncoder.normalizeRawStage,
        compileWebGPUVariant: backend.compileWebGPUVariant.bind(backend),
        compileDefaultVariant(program: IShaderInfo) {
          return compileWebGPUShaderPass(backend, program);
        }
      };
    })
  );
}
