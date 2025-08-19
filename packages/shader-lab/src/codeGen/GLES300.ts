import { EShaderStage } from "../common/Enums";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { StructProp } from "../parser/types";
import { V3_GL_FragColor, V3_GL_FragData } from "./CodeGenVisitor";
import { GLESVisitor } from "./GLESVisitor";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";

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

  override getFragDataCodeGen(index: string | number): string {
    return `${V3_GL_FragData}_${index}`;
  }

  override getReferencedMRTPropText(index: string | number, ident: string): string {
    return `layout(location = ${index}) out vec4 ${ident};`;
  }

  override getAttributeProp(prop: StructProp): string {
    return `in ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    const qualifier = VisitorContext.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    return `${qualifier} ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTDeclare(out: ICodeSegment[]): void {
    const referencedMRTList = VisitorContext.context._referencedMRTList;
    for (let ident in referencedMRTList) {
      const info = referencedMRTList[ident];
      if (typeof info === "string") {
        out.push({
          text: info,
          index: Number.MAX_SAFE_INTEGER
        });
      } else {
        out.push({
          text: this.getReferencedMRTPropText(info.mrtIndex, ident),
          index: info.ident.location.start.index
        });
      }
    }
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
    if (context.stage === EShaderStage.FRAGMENT && node.lexeme === "gl_FragColor") {
      // #if _VERBOSE
      if (context._referencedMRTList["gl_FragData"]) {
        this._reportError(node.location, "cannot use both gl_FragData and gl_FragColor");
      }
      if (context.mrtStruct) {
        this._reportError(node.location, "gl_FragColor cannot be used with MRT (Multiple Render Targets).");
      }
      // #endif
      this._registerFragColorVariable();
      return V3_GL_FragColor;
    }
    return super.visitVariableIdentifier(node);
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    if (node.isFragReturnStatement) {
      const { mrtStruct } = VisitorContext.context;
      if (mrtStruct) {
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
