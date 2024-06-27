import Lexer from "./lexer";
import { Parser } from "./parser";
import Preprocessor from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { IEngineType, IEngineFunction } from "./EngineType";
import { IShaderLab } from "@galacean/engine-design";
import { Logger } from "./Logger";
import { ShaderStruct } from "@galacean/engine-design/types/shader-lab/shaderStruct/ShaderStruct";
import { ShaderStructParser } from "./structParser";

export enum EBackend {
  GLES100 = 0,
  GLES300 = 1
}

export class ShaderLab implements IShaderLab {
  private static _includeMap: Record<string, string> = {};

  private _parser: Parser;

  constructor(engineTypes: Partial<IEngineType> = {}, engineFunctions: Partial<IEngineFunction> = {}) {
    this._parser = Parser.create();
    Object.assign(this._parser.sematicAnalyzer._engineType, engineTypes);
    Object.assign(this._parser.sematicAnalyzer._engineFunctions, engineFunctions);
  }

  /**
   * @internal
   */
  init(engineTypes: Partial<IEngineType>, engineFunctions: Partial<IEngineFunction>) {
    Object.assign(this._parser.sematicAnalyzer._engineType, engineTypes);
    Object.assign(this._parser.sematicAnalyzer._engineFunctions, engineFunctions);
  }

  registerInclude(includeName: string, includeSource: string): void {
    if (ShaderLab._includeMap[includeName]) {
      throw `The "${includeName}" shader include already exist`;
    }
    ShaderLab._includeMap[includeName] = includeSource;
  }

  /**
   * @internal
   */
  setIncludeMap(includeMap: Record<string, string>) {
    ShaderLab._includeMap = includeMap;
  }

  parseShaderPass(source: string, macros: string[] = [], backend = EBackend.GLES300) {
    const preprocessor = new Preprocessor(source, ShaderLab._includeMap);
    for (const macro of macros) {
      preprocessor.addPredefinedMacro(macro);
    }
    // #if _DEVELOPMENT
    Logger.convertSourceIndex = preprocessor.convertSourceIndex.bind(preprocessor);
    // #endif
    const ppdContent = preprocessor.process();
    const lexer = new Lexer(ppdContent);
    const tokens = lexer.tokenize();
    const program = this._parser.parse(tokens);
    const codeGen = backend === EBackend.GLES100 ? new GLES100Visitor() : new GLES300Visitor();
    return codeGen.visitShaderProgram(program);
  }

  parseShaderStruct(shaderSource: string): ShaderStruct {
    const parser = new ShaderStructParser(shaderSource);
    return parser.parse();
  }

  // #if _DEVELOPMENT
  /**
   * @internal for debug
   */
  parse(
    shaderSource: string,
    macros: string[] = [],
    backend = EBackend.GLES300
  ): (ReturnType<ShaderLab["parseShaderPass"]> & { name: string })[] {
    const structInfo = this.parseShaderStruct(shaderSource);
    const passResult = [] as any;
    for (const subShader of structInfo.subShaders) {
      for (const pass of subShader.passes) {
        if (!pass.content) continue;
        const passInfo = this.parseShaderPass(pass.content, macros, backend) as any;
        passInfo.name = pass.name;
        passResult.push(passInfo);
      }
    }
    return passResult;
  }
  // #endif
}
