import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";
import RuntimeContext from "./RuntimeContext";
import ParsingContext from "./ParsingContext";

export class ShaderLab implements IShaderLab {
  /** @internal */
  private _parser: ShaderParser;
  /** @internal */
  private _visitor: ShaderVisitor;
  /** @internal */
  private _context: RuntimeContext;

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

    this._parser.parse(parsingContext.parseString);
    const cst = this._parser.ruleShader();
    if (this._parser.errors.length > 0) {
      for (const err of this._parser.errors) {
        const offset = parsingContext.getTextLineOffsetAt(err.token.startOffset);
        if (offset) {
          err.token.startLine += offset;
          err.token.endLine += offset;
        }
      }
      throw this._parser.errors;
    }

    const ast = this._visitor.visit(cst);
    const shaderInfo = this._context.parse(ast);
    return shaderInfo;
  }
}
