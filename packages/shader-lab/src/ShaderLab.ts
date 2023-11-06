import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";
import RuntimeContext from "./RuntimeContext";

export class ShaderLab implements IShaderLab {
  private _parser: ShaderParser;
  private _visitor: ShaderVisitor;

  constructor() {
    this._parser = new ShaderParser();
    this._visitor = new ShaderVisitor();
  }

  parseShader(shaderSource: string) {
    const editorPropertiesRegex = /EditorProperties\s+\{[^}]*?\}/;

    const input = shaderSource.replace(editorPropertiesRegex, "");

    this._parser.parse(input);
    const cst = this._parser.ruleShader();
    if (this._parser.errors.length > 0) {
      console.log(this._parser.errors);
      throw this._parser.errors;
    }

    const ast = this._visitor.visit(cst);

    const context = new RuntimeContext();
    const shaderInfo = context.parse(ast);

    return shaderInfo;
  }
}
