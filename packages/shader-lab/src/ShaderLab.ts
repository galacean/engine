import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";
import RuntimeContext from "./RuntimeContext";
import { AstNodeUtils } from "./AstNodeUtils";

export class ShaderLab implements IShaderLab {
  /** @internal */
  private _parser: ShaderParser;
  /** @internal */
  private _visitor: ShaderVisitor;
  /** @internal */
  private _context: RuntimeContext;
  /** @internal for test case */
  private get positionOffset() {
    return AstNodeUtils.positionOffset;
  }

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
    const editorPropertiesRegex = /EditorProperties\s+\{[^}]*?\}\s*/;
    const matchedPropertyString = shaderSource.match(editorPropertiesRegex);
    let input: string;

    if (matchedPropertyString) {
      const index = matchedPropertyString.index;
      const content = matchedPropertyString[0];
      let line = 0;
      for (let i = 0; i < content.length; i++) {
        if (content.charAt(i) === "\n") line++;
      }
      AstNodeUtils.positionOffset = { index, line };

      input =
        shaderSource.slice(0, AstNodeUtils.positionOffset.index) +
        shaderSource.slice(AstNodeUtils.positionOffset.index + matchedPropertyString[0].length);
    } else {
      AstNodeUtils.positionOffset = undefined;
      input = shaderSource;
    }

    this._parser.parse(input);
    const cst = this._parser.ruleShader();
    if (this._parser.errors.length > 0) {
      console.log(this._parser.errors);
      if (AstNodeUtils.positionOffset) {
        for (const err of this._parser.errors) {
          err.token.startLine += AstNodeUtils.positionOffset.line;
          err.token.endLine += AstNodeUtils.positionOffset.line;
        }
      }
      throw this._parser.errors;
    }

    const ast = this._visitor.visit(cst);
    const shaderInfo = this._context.parse(ast);
    return shaderInfo;
  }
}
