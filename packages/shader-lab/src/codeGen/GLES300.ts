import { ASTNode, TreeNode } from "../parser/AST";
import { SymbolType } from "../parser/types";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword, ETokenType } from "../common";
import { GLESVisitor } from "./GLESVisitor";
import { EShaderStage } from "../common/Enums";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";
import { ShaderLab } from "../ShaderLab";
import { V3_GL_FragColor, V3_GL_FragData } from "./CodeGenVisitor";

export class GLES300Visitor extends GLESVisitor {
  override _versionText: string = "#version 300 es";

  private static _singleton: GLES300Visitor;
  static getVisitor(): GLES300Visitor {
    if (!this._singleton) {
      this._singleton = new GLES300Visitor();
    }
    return this._singleton;
  }

  override getFragDataCodeGen(index: string | number): string {
    return `${V3_GL_FragData}_${index}`;
  }

  override getReferencedMRTPropText(index: string | number, ident: string): string {
    return `layout(location = ${index}) out vec4 ${ident};`;
  }

  override getAttributeDeclare(out: ICodeSegment[]): void {
    for (const item of Object.values(VisitorContext.context._referencedAttributeList)) {
      out.push({
        text: `in ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
  }

  override getVaryingDeclare(out: ICodeSegment[]): void {
    const qualifier = VisitorContext.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    const values = Object.values(VisitorContext.context._referencedVaryingList);
    for (let i = 0; i < values.length; i++) {
      const item = values[i];
      out.push({
        text: `${item.qualifier ?? qualifier} ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
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
    if (node.ident === "texture2D" || node.ident === "textureCube") {
      ident = "texture";
    } else if (node.ident === "texture2DProj") {
      ident = "textureProj";
    } else if (VisitorContext.context.stage === EShaderStage.FRAGMENT) {
      switch (node.ident) {
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
      this._registerFragColorVariable(node);
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
      this._registerFragColorVariable(node);

      const expression = node.children[1] as ASTNode.Expression;
      return `${V3_GL_FragColor} = ${expression.codeGen(this)};`;
    }
    return super.visitJumpStatement(node);
  }

  private _registerFragColorVariable(node: TreeNode) {
    const { _referencedVaryingList } = VisitorContext.context;
    if (!_referencedVaryingList[V3_GL_FragColor]) {
      const token = Token.pool.get();
      token.set(ETokenType.ID, V3_GL_FragColor, ShaderLab.createPosition(0, 0, 0));
      _referencedVaryingList[V3_GL_FragColor] = {
        ident: token,
        typeInfo: new SymbolType(EKeyword.VEC4, "vec4"),
        qualifier: "out",
        astNode: node
      };
    }
  }
}
