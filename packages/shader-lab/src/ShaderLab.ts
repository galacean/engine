import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";
import RuntimeContext from "./RuntimeContext";
import ParsingContext from "./ParsingContext";
import { Logger } from "@galacean/engine";
import { Preprocessor } from "./preprocessor";

export class ShaderLab implements IShaderLab {
  /** @internal */
  private _parser: ShaderParser;
  /** @internal */
  private _visitor: ShaderVisitor;
  /** @internal */
  private _context: RuntimeContext;
  /** @internal for debug */
  private _extendedSource: string;

  /** @internal */
  get context() {
    return this._context;
  }

  constructor() {
    this._parser = new ShaderParser();
    this._visitor = new ShaderVisitor();
    this._context = new RuntimeContext();
  }

  parseShader(shaderSource: string) {
    const parsingContext = new ParsingContext(shaderSource);
    this._context.parsingContext = parsingContext;
    parsingContext.filterString("EditorProperties");
    parsingContext.filterString("EditorMacros");

    const preprocessor = new Preprocessor(parsingContext.parseString);
    this._context.preprocessor = preprocessor;

    const source = preprocessor.process();
    this._extendedSource = source;
    this._parser.parse(source);
    const cst = this._parser.ruleShader();
    if (this._parser.errors.length > 0) {
      for (const err of this._parser.errors) {
        const offset = parsingContext.getTextLineOffsetAt(err.token.startOffset);
        if (offset) {
          // @ts-ignore
          err.token.originStartLine = err.token.startLine;
          // @ts-ignore
          err.token.originEndLine = err.token.endLine;
          err.token.startLine += offset;
          err.token.endLine += offset;
        }
      }
      Logger.error(`error shaderlab source:`, source);
      throw this._parser.errors;
    }

    const ast = this._visitor.visit(cst);
    const shaderInfo = this._context.parse(ast);
    return shaderInfo;
  }
}
