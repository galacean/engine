import { Logger, ShaderLanguage } from "@galacean/engine-core";
import type { IRenderStates, IShaderSource } from "@galacean/engine-design";
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
 * @param backend - Target GLES language.
 * @param coreInfo - Optional stage facts already derived from this exact parser result.
 * @returns Generated program, or `undefined` when parser or entry admission fails.
 * @internal
 */
export function generateParsedShaderPassData(
  parsed: ParsedShaderPassData,
  vertexEntry: string,
  fragmentEntry: string,
  backend: ShaderLanguage,
  coreInfo?: ShaderCoreInfo
): IShaderProgramSource | undefined {
  if (parsed.blockingErrors.length) {
    for (const error of parsed.blockingErrors) Logger.error(error.toString());
    return undefined;
  }
  if (!parsed.ir) return undefined;
  const resolvedCoreInfo = coreInfo ?? ShaderCoreInfo.create(parsed.ir, vertexEntry, fragmentEntry);
  return generateShaderProgram(parsed.ir, resolvedCoreInfo, backend, parsed.preprocessorExpressions);
}

function generateShaderProgram(
  ir: ShaderClueIR,
  coreInfo: ShaderCoreInfo,
  backend: ShaderLanguage,
  preprocessorExpressions: ParsedShaderPassData["preprocessorExpressions"]
): IShaderProgramSource | undefined {
  if (!coreInfo.vertexEntry.functions.length) {
    Logger.error(`Vertex entry function '${coreInfo.vertexEntry.name}' not found.`);
    return undefined;
  }
  if (!coreInfo.fragmentEntry.functions.length) {
    Logger.error(`Fragment entry function '${coreInfo.fragmentEntry.name}' not found.`);
    return undefined;
  }
  if (coreInfo.vertexEntry.hasDefiniteAmbiguity) {
    Logger.error(`Vertex entry function '${coreInfo.vertexEntry.name}' resolves to multiple declarations.`);
    return undefined;
  }
  if (coreInfo.fragmentEntry.hasDefiniteAmbiguity) {
    Logger.error(`Fragment entry function '${coreInfo.fragmentEntry.name}' resolves to multiple declarations.`);
    return undefined;
  }
  if (coreInfo.roleConflicts.length) {
    Logger.error("A shader IO struct cannot serve multiple stage-interface roles.");
    return undefined;
  }
  if (coreInfo.mrtOutputIssues.length || coreInfo.invalidMrtReturnLocations.length) {
    Logger.error(
      "MRT outputs require unique non-negative locations, vec4 members, and returns through an assigned struct variable."
    );
    return undefined;
  }
  if (coreInfo.invalidVaryingReturnLocations.length) {
    Logger.error("Varying vertex entries must return a struct variable or same-type function result.");
    return undefined;
  }
  if (coreInfo.structMemberOwnerIssues.length) {
    Logger.error("A struct member reference cannot be lowered safely across runtime macro expansion.");
    return undefined;
  }
  const result = GLESBackend.generate(ir, coreInfo, backend);
  if (result) {
    result.vertexShaderInstructions = ShaderInstructionEncoder.parse(result.vertex, preprocessorExpressions);
    result.fragmentShaderInstructions = ShaderInstructionEncoder.parse(result.fragment, preprocessorExpressions);
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
