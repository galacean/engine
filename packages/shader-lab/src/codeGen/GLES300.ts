import { ASTNode } from "../parser/AST";
import { SymbolType } from "../parser/types";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword, ETokenType, ShaderPosition } from "../common";
import { GLESVisitor } from "./GLESVisitor";
import { EShaderStage } from "../common/Enums";
import { ICodeSegment } from "./types";

const V3_GL_FragColor = "GS_glFragColor";

export class GLES300Visitor extends GLESVisitor {
  versionText: string = "#version 300 es";

  override getAttributeDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const [_, item] of this.context._referencedAttributeList) {
      ret.push({
        text: `in ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override getVaryingDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    const qualifier = this.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    for (const [_, item] of this.context._referencedVaryingList) {
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
          ident: new Token(ETokenType.ID, V3_GL_FragColor, new ShaderPosition(0, 0, 0)),
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
