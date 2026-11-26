import { Logger, ReturnableObjectPool, ShaderMacroProcessor } from "@galacean/engine-core";
import type {
  IShaderInfo,
  IWebGPUShaderCompiler,
  IWebGPUShaderOptions,
  IWebGPUShaderProgram
} from "@galacean/engine-design";
import {
  GLESShaderInfo,
  GSError,
  type ShaderClueIR,
  type ShaderCoreInfo
} from "@galacean/engine-shader-parser/internal";
import { WGSLVisitor } from "./codeGen/WGSLVisitor";
import { WGSLProgramLinker } from "./webgpu/WGSLProgramLinker";

const wgslVisitorPool = new ReturnableObjectPool(WGSLVisitor);

/** Generate raw WGSL stage strings + metadata directly from the single ShaderLab IR (zero secondary AST). */
export function generateWGSLFromIR(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): IShaderInfo | undefined {
  const glesInfo = new GLESShaderInfo(ir, coreInfo);
  if (glesInfo.mrtOutputIssues.length || glesInfo.invalidMrtReturnLocations.length) {
    Logger.error(
      "MRT outputs require unique non-negative locations, vec4 members, and returns through an assigned struct variable."
    );
    return undefined;
  }
  if (glesInfo.invalidVaryingReturnLocations.length) {
    Logger.error("Varying vertex entries must return a struct variable or same-type function result.");
    return undefined;
  }
  if (glesInfo.structMemberOwnerIssues.length) {
    Logger.error("A struct member reference cannot be lowered safely across runtime macro expansion.");
    return undefined;
  }
  const visitor = wgslVisitorPool.get();
  try {
    return visitor.generate(ir, coreInfo);
  } catch (error) {
    visitor.dispose();
    if (!(error instanceof GSError)) throw error;
    Logger.error(`${error.file ? `${error.file}: ` : ""}${error.code ? `${error.code}: ` : ""}${error.toString()}`);
    return undefined;
  } finally {
    wgslVisitorPool.return(visitor);
  }
}

/** Compile a single-AST WGSL instruction-based pass for a concrete macro set and vertex layout. */
export function compileWebGPUShaderPass(
  compiler: Pick<IWebGPUShaderCompiler, "compileWebGPUVariant">,
  pass: Pick<IShaderInfo, "uniformBlocks" | "wgslVertexInstructions" | "wgslFragmentInstructions">,
  features: ReadonlyMap<string, string> = new Map(),
  options: IWebGPUShaderOptions = {}
): IWebGPUShaderProgram {
  const macros = new Map(ShaderMacroProcessor._defaultWebGPUMacros);
  features.forEach((value, name) => macros.set(name, value));
  const vertex = pass.wgslVertexInstructions;
  const fragment = pass.wgslFragmentInstructions;
  if (!vertex || !fragment) {
    throw new Error("WebGPU shader pass is missing WGSL instructions; recompile from ShaderLab source.");
  }
  const v = ShaderMacroProcessor.evaluate(vertex, macros);
  const f = ShaderMacroProcessor.evaluate(fragment, macros);
  const enableGPUInstancing = options.enableGPUInstancing ?? macros.has("RENDERER_GPU_INSTANCE");
  const baseResolve = options.resolveConstant;
  const resolveConstant = (name: string): number | undefined => {
    const fromMacro = macros.get(name);
    if (fromMacro !== undefined && /^-?\d+$/.test(fromMacro.trim())) return Number(fromMacro.trim());
    return baseResolve?.(name);
  };
  const linked = compiler.compileWebGPUVariant(v, f, {
    ...options,
    uniformBlocks: options.uniformBlocks ?? pass.uniformBlocks,
    enableGPUInstancing,
    resolveConstant
  });
  if (linked.instanceOverflow) {
    throw new Error("The selected instance does not fit a uniform buffer binding.");
  }
  return linked;
}

/** Create the single-AST WebGPU WGSL compiler (`WGSLVisitor` + zero-AST `WGSLProgramLinker`). */
export function createWebGPUShaderCompilerSync(): IWebGPUShaderCompiler {
  const linker = new WGSLProgramLinker();
  return {
    generateWGSL(ir, coreInfo) {
      return generateWGSLFromIR(ir as ShaderClueIR, coreInfo as ShaderCoreInfo);
    },
    compileWebGPUVariant: linker.link.bind(linker),
    compileDefaultVariant(program: IShaderInfo) {
      return compileWebGPUShaderPass({ compileWebGPUVariant: linker.link.bind(linker) }, program);
    }
  };
}

/** Create the single-AST WebGPU WGSL compiler. */
export function createWebGPUShaderCompiler(): Promise<IWebGPUShaderCompiler> {
  return Promise.resolve(createWebGPUShaderCompilerSync());
}
