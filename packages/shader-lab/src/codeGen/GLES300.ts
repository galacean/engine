import { ASTNode } from "../parser/AST";
import { SymbolType } from "../parser/types";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword, ETokenType, ShaderPosition } from "../common";
import { GLESVisitor } from "./GLESVisitor";
import { EShaderStage } from "../common/Enums";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";
import { ShaderLab } from "../ShaderLab";

const V3_GL_FragColor = "GS_glFragColor";

export class GLES300Visitor extends GLESVisitor {
  versionText: string = "#version 300 es";

  private static _singleton: GLES300Visitor;
  static getVisitor(): GLES300Visitor {
    if (!this._singleton) {
      this._singleton = new GLES300Visitor();
    }
    return this._singleton;
  }

  override getAttributeDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const item of Object.values(VisitorContext.context._referencedAttributeList)) {
      ret.push({
        text: `in ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override getVaryingDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    const qualifier = VisitorContext.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    const values = Object.values(VisitorContext.context._referencedVaryingList);
    for (let i = 0; i < values.length; i++) {
      const item = values[i];
      ret.push({
        text: `${item.qualifier ?? qualifier} ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    const typeSpecifier = node.children[0] as ASTNode.TypeSpecifier;
    if (typeSpecifier.children.length !== 1) {
      return this.defaultCodeGen(node.children);
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
    if (VisitorContext.context.stage === EShaderStage.FRAGMENT && node.lexeme === "gl_FragColor") {
      if (!VisitorContext.context._referencedVaryingList[V3_GL_FragColor]) {
        const token = Token.pool.get();
        token.set(ETokenType.ID, V3_GL_FragColor, ShaderLab.createPosition(0, 0, 0));
        VisitorContext.context._referencedVaryingList[V3_GL_FragColor] = {
          ident: token,
          typeInfo: new SymbolType(EKeyword.VEC4, "vec4"),
          qualifier: "out",
          astNode: node
        };
      }
      return V3_GL_FragColor;
    }
    return super.visitVariableIdentifier(node);
  }
}
