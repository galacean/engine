import { EShaderStage } from "../common/enums/ShaderStage";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { StructProp } from "../parser/types";
import { GLESVisitor } from "./GLESVisitor";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";

const V3_GL_FragColor = "GS_glFragColor";

export class GLES300Visitor extends GLESVisitor {
  private static _singleton: GLES300Visitor;
  static getVisitor(): GLES300Visitor {
    if (!this._singleton) {
      this._singleton = new GLES300Visitor();
    }
    return this._singleton;
  }

  private _otherCodeArray: ICodeSegment[] = [];
  private _fragColorVariableRegistered = false;

  override reset(): void {
    super.reset();

    this._otherCodeArray.length = 0;
    this._fragColorVariableRegistered = false;
  }

  override getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    super.getOtherGlobal(data, out);

    for (let i = 0, n = this._otherCodeArray.length; i < n; i++) {
      out.push(this._otherCodeArray[i]);
    }
  }

  override getAttributeProp(prop: StructProp): string {
    return `in ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    const qualifier = VisitorContext.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    return `${qualifier} ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTProp(prop: StructProp): string {
    return `layout(location = ${prop.mrtIndex}) out vec4 ${prop.ident.lexeme};`;
  }

  override visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    const children = node.children;
    const typeSpecifier = children[0] as ASTNode.TypeSpecifier;
    if (typeSpecifier.children.length !== 1) {
      return this.defaultCodeGen(children);
    }
    let ident = node.lexeme;
    switch (node.ident) {
      case "texture2D":
      case "textureCube":
        ident = "texture";
        break;
      case "texture2DProj":
        ident = "textureProj";
        break;
      case "texture2DLodEXT":
      case "textureCubeLodEXT":
        ident = "textureLod";
        break;
      case "texture2DGradEXT":
      case "textureCubeGradEXT":
        ident = "textureGrad";
        break;
      case "texture2DProjLodEXT":
        ident = "textureProjLod";
        break;
      case "texture2DProjGradEXT":
        ident = "textureProjGrad";
        break;
      case "gl_FragDepthEXT":
        ident = "gl_FragDepth";
        break;
    }
    return ident;
  }

  override visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    const { context } = VisitorContext;
    if (context.stage === EShaderStage.FRAGMENT && node.getLexeme(this) === "gl_FragColor") {
      if (context.mrtStructs.length) {
        this._reportError(node.location, "gl_FragColor cannot be used with MRT (Multiple Render Targets).");
        return;
      }
      this._registerFragColorVariable();
      return V3_GL_FragColor;
    }
    return super.visitVariableIdentifier(node);
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    if (node.isFragReturnStatement) {
      if (VisitorContext.context.mrtStructs.length) {
        return "";
      }
      this._registerFragColorVariable();

      const expression = node.children[1] as ASTNode.Expression;
      return `${V3_GL_FragColor} = ${expression.codeGen(this)};`;
    }
    return super.visitJumpStatement(node);
  }

  private _registerFragColorVariable() {
    if (this._fragColorVariableRegistered) return;
    this._otherCodeArray.push({
      text: `out vec4 ${V3_GL_FragColor};`,
      index: 0
    });
    this._fragColorVariableRegistered = true;
  }
}
