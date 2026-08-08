import { Color } from "@galacean/engine-math";
import { ShaderLanguage } from "@galacean/engine-core";
import { Logger } from "@galacean/engine-core";
import type { IPrecompiledShader, IRenderStates, IShaderSource } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { ShaderCoreInfo } from "@galacean/engine-shader-parser/internal";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";
import {
  parseRuntimeShaderPass,
  type ParsedShaderPass,
  type ShaderClueIR,
  type IncludeMap,
  type ChunkOutputCache
} from "@galacean/engine-shader-parser/internal";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import type { ShaderSourceParseResult } from "@galacean/engine-shader-parser/internal";
import { GLESBackend } from "./GLESBackend";

class ShaderSourceParseError extends Error {
  constructor(readonly errors: readonly Error[]) {
    super(errors.map((error) => error.toString()).join("\n"));
    this.name = "ShaderSourceParseError";
  }
}

/**
 * Compiles ShaderLab sources into GLES programs and precompiled instructions.
 *
 * Source parsing and backend generation remain independent of authoring diagnostics; structural
 * source errors reject compilation before a partial precompiled artifact can be serialized.
 */
export class ShaderCompiler {
  private _includeMap: IncludeMap = {};
  private _chunkOutputCache: ChunkOutputCache = new Map();

  /**
   * Replaces the `#include` lookup table and clears the derived chunk cache.
   * @param includeMap - Canonical include paths mapped to shader chunks.
   * @internal
   */
  _setIncludeMap(includeMap: IncludeMap): void {
    this._includeMap = includeMap;
    this._chunkOutputCache.clear();
  }

  /**
   * Parses one ShaderLab document into its source structure.
   * @param sourceCode - Complete ShaderLab source.
   * @returns Parsed subshaders, passes, entries, and render states.
   * @throws ShaderSourceParseError when source-structure diagnostics were produced.
   * @internal
   */
  _parseShaderSource(sourceCode: string): IShaderSource {
    this._chunkOutputCache = new Map();
    return this._requireValidShaderSource(this._parseShaderSourceWithErrors(sourceCode));
  }

  /** @internal */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    sourceFile?: string
  ): IShaderProgramSource | undefined {
    const parsed = parseRuntimeShaderPass(source, this._includeMap, this._chunkOutputCache, sourceFile);
    if (parsed.errors.length) {
      for (const error of parsed.errors) Logger.error(error.toString());
      return undefined;
    }
    return this._generateParsedShaderPass(parsed, vertexEntry, fragmentEntry, backend);
  }

  /**
   * Generates GLES source from an existing immutable parser result.
   * @param parsed - Parsed pass produced by the runtime or analyzer parser entry.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @param backend - GLES language version to generate.
   * @returns Generated and encoded stage source, or `undefined` when no IR was produced.
   * @internal
   */
  _generateParsedShaderPass(
    parsed: ParsedShaderPass,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage
  ): IShaderProgramSource | undefined {
    if (!parsed.ir) return undefined;
    try {
      const coreInfo = ShaderCoreInfo.create(parsed.ir, vertexEntry, fragmentEntry);
      return this._generate(parsed.ir, coreInfo, backend);
    } catch (error) {
      Logger.error(error instanceof Error ? error.toString() : String(error));
      return undefined;
    }
  }

  private _generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo, backend: ShaderLanguage): IShaderProgramSource {
    if (!coreInfo.vertexEntry.functions.length) {
      throw new Error(`Vertex entry function '${coreInfo.vertexEntry.name}' not found.`);
    }
    if (!coreInfo.fragmentEntry.functions.length) {
      throw new Error(`Fragment entry function '${coreInfo.fragmentEntry.name}' not found.`);
    }
    const ret = GLESBackend.generate(ir, coreInfo, backend);
    if (ret) {
      ret.vertexShaderInstructions = ShaderInstructionEncoder.parse(ret.vertex);
      ret.fragmentShaderInstructions = ShaderInstructionEncoder.parse(ret.fragment);
    }
    return ret;
  }

  /** @internal */
  _precompile(sourceCode: string, platformTarget: ShaderLanguage, sourceFile?: string): IPrecompiledShader {
    this._chunkOutputCache = new Map();
    const sourceResult = this._parseShaderSourceWithErrors(sourceCode);
    const shaderSource = this._requireValidShaderSource(sourceResult);

    const subShaders = shaderSource.subShaders.map((sub) => ({
      name: sub.name,
      tags: sub.tags,
      passes: sub.passes.map((pass) => {
        if (pass.isUsePass) {
          return {
            name: pass.name,
            isUsePass: true as const,
            tags: pass.tags,
            renderStates: this._serializeRenderStates(pass.renderStates)
          };
        }

        const programSource = this._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          platformTarget,
          sourceFile
        );

        if (!programSource) {
          throw new Error(
            `Shader pass "${shaderSource.name}.${sub.name}.${pass.name}" precompile failed, please check the shader source code.`
          );
        }

        return {
          name: pass.name,
          isUsePass: false as const,
          tags: pass.tags,
          renderStates: this._serializeRenderStates(pass.renderStates),
          vertexShaderInstructions: programSource.vertexShaderInstructions,
          fragmentShaderInstructions: programSource.fragmentShaderInstructions
        };
      })
    }));

    return {
      name: shaderSource.name,
      platformTarget,
      subShaders
    };
  }

  private _parseShaderSourceWithErrors(sourceCode: string): ShaderSourceParseResult {
    return ShaderSourceParser.parseWithErrors(sourceCode);
  }

  private _requireValidShaderSource(result: ShaderSourceParseResult): IShaderSource {
    if (result.errors.length) throw new ShaderSourceParseError(result.errors);
    return result.shaderSource;
  }

  private _serializeRenderStates(renderStates: IRenderStates): {
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
    return {
      constantMap,
      variableMap: renderStates.variableMap
    };
  }
}
