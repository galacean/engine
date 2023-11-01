import { AstNodeUtils } from "./AstNodeUtils";
import { IShaderLab } from "@galacean/engine-design";
import { ShaderParser } from "./parser/ShaderParser";
import { ShaderVisitor } from "./ShaderVisitor";
import RuntimeContext, { IDiagnostic } from "./RuntimeContext";
import { DiagnosticSeverity } from "./Constants";

export class ShaderLab implements IShaderLab {
  private _parser: ShaderParser;
  private _visitor: ShaderVisitor;
  private _context: RuntimeContext;

  /** @internal */
  get diagnostic(): IDiagnostic[] {
    if (this._parser.errors?.length > 0) {
      return this._parser.errors.map((item) => ({
        severity: DiagnosticSeverity.Error,
        message: item.message,
        range: AstNodeUtils.getTokenPosition(item.token)
      }));
    } else {
      return this._context.diagnostics;
    }
  }

  constructor() {
    this._parser = new ShaderParser();
    this._visitor = new ShaderVisitor();
    this._context = new RuntimeContext();
  }

  parseShader(shaderSource: string) {
    const editorPropertiesRegex = /EditorProperties\s+\{[^}]*?\}/;

    return AstNodeUtils.parseShader(
      shaderSource.replace(editorPropertiesRegex, ""),
      this._parser,
      this._visitor,
      this._context
    );
  }
}
