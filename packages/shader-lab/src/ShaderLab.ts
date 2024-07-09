import Lexer from "./lexer";
import { Parser } from "./parser";
import Preprocessor from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { Logger } from "./Logger";
import { ShaderContent, IShaderLab } from "@galacean/engine-design/src/shader-lab";
import { ShaderContentParser } from "./contentParser";
// @ts-ignore
import { ShaderLib, ShaderPlatformTarget } from "@galacean/engine";

export class ShaderLab implements IShaderLab {
  private static _includeMap: Record<string, string> = ShaderLib;

  private _parser = Parser.create();

  /**
   * @internal
   * Register new snippets that can be referenced by `#include` macro in `ShaderLab`.
   * @param includeName - the key used by `#include` macro directive.
   * @param includeSource - the replaced snippets.
   */
  _registerInclude(includeName: string, includeSource: string): void {
    if (ShaderLab._includeMap[includeName]) {
      throw `The "${includeName}" shader include already exist`;
    }
    ShaderLab._includeMap[includeName] = includeSource;
  }

  /**
   * @internal
   */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: string[],
    backend: ShaderPlatformTarget
  ) {
    const preprocessor = new Preprocessor(source, ShaderLab._includeMap);
    for (const macro of macros) {
      const info = macro.split(" ", 2);
      preprocessor.addPredefinedMacro(info[0], info[1]);
    }
    // #if _EDITOR
    Logger.convertSourceIndex = preprocessor.convertSourceIndex.bind(preprocessor);
    // #endif
    const ppdContent = preprocessor.process();
    const lexer = new Lexer(ppdContent);
    const tokens = lexer.tokenize();
    const program = this._parser.parse(tokens);
    const codeGen = backend === ShaderPlatformTarget.GLES100 ? new GLES100Visitor() : new GLES300Visitor();
    return codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
  }

  /**
   * @internal
   */
  _parseShaderContent(shaderSource: string): ShaderContent {
    const parser = new ShaderContentParser(shaderSource);
    return parser.parse();
  }

  // #if _EDITOR
  /**
   * @internal
   * For debug
   */
  _parse(
    shaderSource: string,
    macros: string[],
    backend: ShaderPlatformTarget
  ): (ReturnType<ShaderLab["_parseShaderPass"]> & { name: string })[] {
    const structInfo = this._parseShaderContent(shaderSource);
    const passResult = [] as any;
    for (const subShader of structInfo.subShaders) {
      for (const pass of subShader.passes) {
        if (!pass.isUsePass) continue;
        const passInfo = this._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          macros,
          backend
        ) as any;
        passInfo.name = pass.name;
        passResult.push(passInfo);
      }
    }
    return passResult;
  }
  // #endif
}
