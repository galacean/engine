import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { ASTNode } from "@galacean/engine-shader-parser/internal";
import { StructProp } from "@galacean/engine-shader-parser/internal";
import { GLESVisitor } from "./GLESVisitor";

export class GLES100Visitor extends GLESVisitor {
  override getAttributeProp(prop: StructProp): string {
    return `attribute ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    return `varying ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTProp(): string {
    return "";
  }

  override visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    const { children } = node;
    const postExpr = children[0];
    const context = this.context;
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
    if (this.context.fragmentReturns.has(node)) {
      if (this.context.mrtStructs.length) {
        return "";
      }
      const expression = node.children[1] as ASTNode.Expression;
      return `gl_FragColor = ${expression.codeGen(this)};`;
    }
    return super.visitJumpStatement(node);
  }
}
