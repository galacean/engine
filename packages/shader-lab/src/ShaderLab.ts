import { AstNodeUtils } from "./AstNodeUtils";
import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";

export class ShaderLab implements IShaderLab {
  private _parser: ShaderParser;
  private _visitor: ShaderVisitor;

  constructor() {
    this._parser = new ShaderParser();
    this._visitor = new ShaderVisitor();
  }

  parseShader(shaderSource: string) {
    const editorPropertiesRegex = /EditorProperties\s+\{[^}]*?\}/;

    return AstNodeUtils.parseShader(shaderSource.replace(editorPropertiesRegex, ""), this._parser, this._visitor);
  }
}
