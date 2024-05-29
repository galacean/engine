import { ASTNode } from "../Parser/AST";
import { GLESVisitor } from "./GLESVisitor";
import { EShaderStage } from "./constants";

export class GLES300Visitor extends GLESVisitor {
  versionText: string = "#version 300 es";

  override getAttributeDeclare(): string {
    return Array.from(this.context._referencedAttributeList.values())
      .map((item) => `in ${item.typeInfo.typeLexeme} ${item.ident.lexeme}`)
      .join("\n");
  }

  override getVaryingDeclare(): string {
    const qualifier = this.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    return Array.from(this.context._referencedVaryingList.values())
      .map((item) => `${qualifier} ${item.typeInfo.typeLexeme} ${item.ident.lexeme}`)
      .join("\n");
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
}
