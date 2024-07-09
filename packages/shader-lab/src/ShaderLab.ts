import Lexer from "./lexer";
import { ShaderTargetParser } from "./parser";
import Preprocessor from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { Logger } from "./Logger";
import { ShaderContent, IShaderLab } from "@galacean/engine-design/src/shader-lab";
import { ShaderContentParser } from "./contentParser";
// @ts-ignore
import { ShaderLib, ShaderMacro, ShaderPlatformTarget } from "@galacean/engine";

export class ShaderLab implements IShaderLab {
  private _parser = ShaderTargetParser.create();

  /**
   * @internal
   */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: ShaderMacro[],
    backend: ShaderPlatformTarget,
    platformMacros: string[]
  ) {
    const preprocessor = new Preprocessor(source, ShaderLib);
    for (const macro of macros) {
      preprocessor.addPredefinedMacro(macro.name, macro.value);
    }

    for (let i = 0; i < platformMacros.length; i++) {
      preprocessor.addPredefinedMacro(platformMacros[0]);
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
    macros: ShaderMacro[],
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
          backend,
          []
        ) as any;
        passInfo.name = pass.name;
        passResult.push(passInfo);
      }
    }
    return passResult;
  }
  // #endif
}
