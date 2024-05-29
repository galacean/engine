import Lexer from "./Lexer";
import { Parser } from "./Parser";
import Preprocessor from "./Preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./CodeGen";
import { IEngineType, EngineType } from "./EngineType";
import { IShaderLab } from "@galacean/engine-design";

export enum EBackend {
  GLES100,
  GLES300
}

export class ShaderLab implements IShaderLab {
  private parser: Parser;

  constructor(engineInfo: Partial<IEngineType> = {}) {
    this.parser = Parser.create();
    Object.assign(EngineType, engineInfo);
  }

  parseShader(source: string, includeMap: Record<string, string> = {}, backend = EBackend.GLES300) {
    const preprocessor = new Preprocessor(source, includeMap);
    const ppdContent = preprocessor.process();
    const lexer = new Lexer(ppdContent);
    const tokens = lexer.tokenize();
    const program = this.parser.parse(tokens);
    const codeGen = backend === EBackend.GLES100 ? new GLES100Visitor() : new GLES300Visitor();
    return codeGen.visitShaderProgram(program);
  }
}
