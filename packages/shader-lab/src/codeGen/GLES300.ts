import { ASTNode } from "../parser/AST";
import { SymbolType } from "../parser/types";
import { BaseToken as Token } from "../BaseToken";
import { EKeyword, ETokenType, Position } from "../common";
import { GLESVisitor } from "./GLESVisitor";
import { EShaderStage } from "./constants";

const V3_GL_FragColor = "GS_glFragColor";

export class GLES300Visitor extends GLESVisitor {
  versionText: string = "#version 300 es";

  override getAttributeDeclare(): [string, number][] {
    return Array.from(this.context._referencedAttributeList.values()).map((item) => [
      `in ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
      item.ident.location.start.index
    ]);
  }

  override getVaryingDeclare(): [string, number][] {
    const qualifier = this.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    return Array.from(this.context._referencedVaryingList.values()).map((item) => [
      `${item.qualifier ?? qualifier} ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
      item.ident.location.start.index
    ]);
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
    } else if (this.context.stage === EShaderStage.FRAGMENT) {
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
    if (this.context.stage === EShaderStage.FRAGMENT && node.lexeme === "gl_FragColor") {
      if (!this.context._referencedVaryingList.has(V3_GL_FragColor)) {
        this.context._referencedVaryingList.set(V3_GL_FragColor, {
          ident: new Token(ETokenType.ID, V3_GL_FragColor, new Position(0, 0, 0)),
          typeInfo: new SymbolType(EKeyword.VEC4, "vec4"),
          qualifier: "out",
          astNode: node
        });
      }
      return V3_GL_FragColor;
    }
    return super.visitVariableIdentifier(node);
  }
}
