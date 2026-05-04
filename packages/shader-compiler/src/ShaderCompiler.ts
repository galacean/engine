import { Color } from "@galacean/engine-math";
import { ShaderLanguage } from "@galacean/engine-core";
import type { IPrecompiledShader, IRenderStates, IShaderSource } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderPosition, ShaderRange } from "./common";
import { Lexer } from "./lexer";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";
import { ShaderTargetParser } from "./parser";
import { Preprocessor, IncludeMap } from "./Preprocessor";
import { ShaderCompilerUtils } from "./ShaderCompilerUtils";
import { ShaderSourceParser } from "./sourceParser/ShaderSourceParser";

// `IShaderCompiler` (in engine-design) is the engine-runtime view of this
// class — i.e. the interface engine-core uses when accepting a shader compiler
// instance. We don't `implements` it here because that would force our
// internal source-tree types (which use the local minimal Color) to be
// nominally identical to the design-side ones (which use math Color); the two
// are structurally compatible at runtime — Color → number[] serialization in
// `_serializeRenderStates` ensures the wire format matches — but tsc's
// nominal typing rejects the assignment. Engine-side `WebGLEngine.create({
// shaderCompiler })` already takes the instance through the design interface.
export class ShaderCompiler {
  private static _parser = ShaderTargetParser.create();
  private static _shaderPositionPool = ShaderCompilerUtils.createObjectPool(ShaderPosition);
  private static _shaderRangePool = ShaderCompilerUtils.createObjectPool(ShaderRange);

  // #if _VERBOSE
  static _processingPassText?: string;
  // #endif

  /**
   * `#include` lookup table. Defaults to an empty map; runtime callers (engine
   * `Shader.create` flow) bind it to `ShaderFactory.includeMap` so the runtime
   * include registry stays the source of truth. Build-time callers (the
   * bundler) bind it to a freshly-scanned src map so chunk path renames take
   * effect on the next precompile without rebuilding any package.
   *
   * Keeping the binding here (instead of having `Preprocessor` read a global)
   * means shader-compiler does not import `ShaderFactory` and stays free of
   * any engine module-load side effects.
   */
  _includeMap: IncludeMap = {};

  static createPosition(index: number, line?: number, column?: number): ShaderPosition {
    const position = this._shaderPositionPool.get();
    position.set(
      index,
      // #if _VERBOSE
      line,
      column
      // #endif
    );
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = this._shaderRangePool.get();
    range.set(start, end);
    return range;
  }

  _parseShaderSource(sourceCode: string): IShaderSource {
    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
    const shaderSource = ShaderSourceParser.parse(sourceCode);

    // #if _VERBOSE
    this._logErrors(ShaderSourceParser.errors);
    // #endif

    return shaderSource;
  }

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const macroDefineList = {};
    Preprocessor._repeatIncludeSet.clear();
    const noIncludeContent = Preprocessor.parse(source, basePathForIncludeKey, this._includeMap);

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const { _parser: parser } = ShaderCompiler;

    ShaderCompiler._processingPassText = noIncludeContent;

    const program = parser.parse(tokens, macroDefineList);

    // #if _VERBOSE
    this._logErrors(parser.errors);
    // #endif

    if (!program) {
      return undefined;
    }

    const codeGen = backend === ShaderLanguage.GLSLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    ShaderCompiler._processingPassText = undefined;

    // #if _VERBOSE
    this._logErrors(codeGen.errors);
    // #endif

    if (ret) {
      // Always parse instructions for the compiled GLSL
      ret.vertexShaderInstructions = ShaderInstructionEncoder.parse(ret.vertex);
      ret.fragmentShaderInstructions = ShaderInstructionEncoder.parse(ret.fragment);
    }

    return ret;
  }

  _precompile(sourceCode: string, platformTarget: ShaderLanguage, basePathForIncludeKey: string): IPrecompiledShader {
    const shaderSource = this._parseShaderSource(sourceCode);

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
          basePathForIncludeKey
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

  // #if _VERBOSE
  /**
   * @internal
   */
  _logErrors(errors: Error[]) {
    if (errors.length === 0) return;
    console.error(`${errors.length} errors occur!`);
    for (const err of errors) {
      console.error(err.toString());
    }
  }
  // #endif
}
