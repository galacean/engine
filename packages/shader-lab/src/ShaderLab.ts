import Lexer from "./lexer";
import { Parser } from "./parser";
import Preprocessor from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { IEngineType, EngineType, IEngineFunction, EngineFunctions } from "./EngineType";
import { IShaderLab } from "@galacean/engine-design";
import { Logger } from "./Logger";

export enum EBackend {
  GLES100,
  GLES300
}

export class ShaderLab implements IShaderLab {
  private _parser: Parser;

  constructor(engineTypes: Partial<IEngineType> = {}, engineFunctions: Partial<IEngineFunction> = {}) {
    this._parser = Parser.create();
    Object.assign(EngineType, engineTypes);
    Object.assign(EngineFunctions, engineFunctions);
  }

  parseShader(
    source: string,
    macros: string[] = [],
    includeMap: Record<string, string> = {},
    backend = EBackend.GLES300
  ) {
    const preprocessor = new Preprocessor(source, includeMap);
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
}
