import { Logger, ShaderLanguage } from "@galacean/engine-core";
import type { IRenderStates, IShaderSource, IWebGPUShaderCompiler } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { Color } from "@galacean/engine-math";
import {
  GSError,
  ShaderCoreInfo,
  type ParsedShaderPassData,
  type ShaderClueIR,
  type ShaderSourceParseResult
} from "@galacean/engine-shader-parser/internal";
import { GLESBackend } from "./GLESBackend";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";

class ShaderSourceParseError extends Error {
  constructor(readonly errors: readonly Error[]) {
    super(errors.map((error) => error.toString()).join("\n"));
    this.name = "ShaderSourceParseError";
  }
}

/**
 * Rejects a partial ShaderLab structure when source parsing produced errors.
 * @param result - ShaderLab source-parser result.
 * @returns Complete parsed ShaderLab structure.
 * @throws ShaderSourceParseError when structural source diagnostics exist.
 * @internal
 */
export function requireValidShaderSource(result: ShaderSourceParseResult): IShaderSource {
  if (result.errors.length) throw new ShaderSourceParseError(result.errors);
  return result.shaderSource;
}

/**
 * Generates one backend program from a parser-owned pass without reparsing it.
 * @param parsed - Neutral parser output.
 * @param vertexEntry - Vertex entry name.
 * @param fragmentEntry - Fragment entry name.
 * @param backend - Target shader language.
 * @param coreInfo - Optional stage facts already derived from this exact parser result.
 * @returns Generated program, or `undefined` when parser or entry admission fails.
 * @internal
 */
export function generateParsedShaderPassData(
  parsed: ParsedShaderPassData,
  vertexEntry: string,
  fragmentEntry: string,
  backend: ShaderLanguage,
  coreInfo?: ShaderCoreInfo,
  webgpu?: IWebGPUShaderCompiler,
  requireDefaultVariant = true
): IShaderProgramSource | undefined {
  if (parsed.blockingErrors.length) {
    for (const error of parsed.blockingErrors) Logger.error(error.toString());
    return undefined;
  }
  if (!parsed.ir) return undefined;
  const resolvedCoreInfo = coreInfo ?? ShaderCoreInfo.create(parsed.ir, vertexEntry, fragmentEntry);
  if (backend === ShaderLanguage.WGSL) {
    if (!webgpu?.generateWGSL) {
      throw new Error("WGSL compilation requires a backend from createWebGPUShaderCompiler().");
    }
    return generateWGSLShaderProgram(
      parsed.ir,
      resolvedCoreInfo,
      parsed.preprocessorExpressions,
      webgpu,
      requireDefaultVariant
    );
  }
  return generateShaderProgram(parsed.ir, resolvedCoreInfo, backend, parsed.preprocessorExpressions);
}

function validateStageEntries(coreInfo: ShaderCoreInfo): boolean {
  if (!coreInfo.vertexEntry.functions.length) {
    Logger.error(`Vertex entry function '${coreInfo.vertexEntry.name}' not found.`);
    return false;
  }
  if (!coreInfo.fragmentEntry.functions.length) {
    Logger.error(`Fragment entry function '${coreInfo.fragmentEntry.name}' not found.`);
    return false;
  }
  if (coreInfo.vertexEntry.hasDefiniteAmbiguity) {
    Logger.error(`Vertex entry function '${coreInfo.vertexEntry.name}' resolves to multiple declarations.`);
    return false;
  }
  if (coreInfo.fragmentEntry.hasDefiniteAmbiguity) {
    Logger.error(`Fragment entry function '${coreInfo.fragmentEntry.name}' resolves to multiple declarations.`);
    return false;
  }
  if (coreInfo.roleConflicts.length) {
    Logger.error("A shader IO struct cannot serve multiple stage-interface roles.");
    return false;
  }
  return true;
}

function generateWGSLShaderProgram(
  ir: ShaderClueIR,
  coreInfo: ShaderCoreInfo,
  preprocessorExpressions: ParsedShaderPassData["preprocessorExpressions"],
  webgpu: IWebGPUShaderCompiler,
  requireDefaultVariant = true
): IShaderProgramSource | undefined {
  if (!validateStageEntries(coreInfo)) return undefined;
  const result = webgpu.generateWGSL!(ir, coreInfo);
  if (!result) return undefined;
  result.wgslVertexInstructions = ShaderInstructionEncoder.parse(result.vertex, preprocessorExpressions);
  result.wgslFragmentInstructions = ShaderInstructionEncoder.parse(result.fragment, preprocessorExpressions);
  if (requireDefaultVariant) {
    const wgsl = webgpu.compileDefaultVariant(result);
    result.wgsl = wgsl;
    result.vertex = wgsl.vertex;
    result.fragment = wgsl.fragment;
  } else {
    try {
      const wgsl = webgpu.compileDefaultVariant(result);
      result.wgsl = wgsl;
      result.vertex = wgsl.vertex;
      result.fragment = wgsl.fragment;
    } catch {
      // Runtime ShaderLab sources may require renderer/material macros before linking.
    }
  }
  return result;
}

function generateShaderProgram(
  ir: ShaderClueIR,
  coreInfo: ShaderCoreInfo,
  backend: ShaderLanguage,
  preprocessorExpressions: ParsedShaderPassData["preprocessorExpressions"]
): IShaderProgramSource | undefined {
  if (!validateStageEntries(coreInfo)) return undefined;
  const result = GLESBackend.generate(ir, coreInfo, backend);
  if (result) {
    result.vertexShaderInstructions = ShaderInstructionEncoder.parse(
      result.vertex,
      preprocessorExpressions,
      result.uniformPlan?.vertex
    );
    result.fragmentShaderInstructions = ShaderInstructionEncoder.parse(
      result.fragment,
      preprocessorExpressions,
      result.uniformPlan?.fragment
    );
    if (
      result.uniformPlan &&
      (!ShaderInstructionEncoder.supportsUniformPlan(result.vertexShaderInstructions, result.uniformPlan.vertex) ||
        !ShaderInstructionEncoder.supportsUniformPlan(result.fragmentShaderInstructions, result.uniformPlan.fragment))
    ) {
      delete result.uniformPlan;
    }
    result.vertex = ShaderInstructionEncoder.source(result.vertex);
    result.fragment = ShaderInstructionEncoder.source(result.fragment);
  }
  return result;
}

/**
 * Converts parser-owned render states into JSON-safe precompile data.
 * @param renderStates - Parsed render-state maps.
 * @returns Serializable constant and variable maps.
 * @internal
 */
export function serializeRenderStates(renderStates: IRenderStates): {
  constantMap: Record<string, number | string | boolean | number[]>;
  variableMap: Record<string, string>;
} {
  const constantMap: Record<string, number | string | boolean | number[]> = {};
  for (const key in renderStates.constantMap) {
    const value = renderStates.constantMap[key];
    if (value instanceof Color) {
      constantMap[key] = [value.r, value.g, value.b, value.a];
    } else {
      constantMap[key] = value as number | string | boolean;
    }
  }
  return { constantMap, variableMap: renderStates.variableMap };
}

/**
 * Formats a parser failure with include-source attribution.
 * @param error - Parser failure.
 * @returns User-facing error text.
 * @internal
 */
export function formatShaderError(error: Error): string {
  const text = error.toString();
  return error instanceof GSError && error.file ? `${error.file}: ${text}` : text;
}
