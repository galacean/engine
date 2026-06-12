import { BaseToken } from "@galacean/engine-shader-parser";
import { ASTNode } from "@galacean/engine-shader-parser";
import { StructProp } from "@galacean/engine-shader-parser";
import { GLESVisitor } from "./GLESVisitor";
import { VisitorContext } from "./VisitorContext";

export class GLES100Visitor extends GLESVisitor {
  private static _singleton: GLES100Visitor;
  static getVisitor(): GLES100Visitor {
    if (!this._singleton) {
      this._singleton = new GLES100Visitor();
    }
    return this._singleton;
  }

  override getAttributeProp(prop: StructProp): string {
    return `attribute ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    return `varying ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTProp(): string {
    return null;
  }

  override visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    const { children } = node;
    const postExpr = children[0];
    const { context } = VisitorContext;
    if (postExpr instanceof ASTNode.PostfixExpression && context.isMRTStruct(<string>postExpr.type)) {
      const propReferenced = children[2] as BaseToken;
      const prop = context.mrtList.find((item) => item.ident.lexeme === propReferenced.lexeme);
      // The parser already validated struct fields (UndeclaredStructMember); a miss here is an
      // already-errored shader, so emit nothing rather than re-report.
      if (!prop) return "";
      return `gl_FragData[${prop.mrtIndex!}]`;
    }
    return super.visitPostfixExpression(node);
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    if (node.isFragReturnStatement) {
      if (VisitorContext.context.mrtStructs.length) {
        return "";
      }
      const expression = node.children[1] as ASTNode.Expression;
      return `gl_FragColor = ${expression.codeGen(this)};`;
    }
    return super.visitJumpStatement(node);
  }
}
