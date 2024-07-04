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

  constructor();
  constructor(
    renderStateElementKey: Record<string, number>,
    engineTypes: Partial<IEngineType>,
    colorCst: new (...args: number[]) => any
  );

  constructor(
    renderStateElementKey: Record<string, number> = {},
    engineTypes: Partial<IEngineType> = {},
    colorCst?: new (...args: number[]) => any
  ) {
    this._parser = Parser.create();
    ShaderStructParser._RenderStateElementKey = renderStateElementKey;
    ShaderStructParser._engineType = engineTypes;
    ShaderStructParser._Color = colorCst;
  }

  /**
   * @internal
   */
  init(
    renderStateElementKey: Record<string, number>,
    engineTypes: Partial<IEngineType>,
    colorCst: new (...args: number[]) => any
  ) {
    ShaderStructParser._engineType = engineTypes;
    ShaderStructParser._Color = colorCst;
    ShaderStructParser._RenderStateElementKey = renderStateElementKey;
  }

  /**
   * Register new snippets that can be referenced by `#include` macro in `ShaderLab`.
   * @param includeName - the key used by `#include` macro directive.
   * @param includeSource - the replaced snippets.
   */
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

  parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: string[] = [],
    backend = EBackend.GLES300
  ) {
    const preprocessor = new Preprocessor(source, ShaderLab._includeMap);
    for (const macro of macros) {
      const info = macro.split(" ", 2);
      preprocessor.addPredefinedMacro(info[0], info[1]);
    }
    // #if _DEVELOPMENT
    Logger.convertSourceIndex = preprocessor.convertSourceIndex.bind(preprocessor);
    // #endif
    const ppdContent = preprocessor.process();
    // console.log(ppdContent);
    const lexer = new Lexer(ppdContent);
    const tokens = lexer.tokenize();
    const program = this._parser.parse(tokens);
    const codeGen = backend === EBackend.GLES100 ? new GLES100Visitor() : new GLES300Visitor();
    return codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
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
        if (!pass.contents) continue;
        // console.log(pass.contents);
        const passInfo = this.parseShaderPass(
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
