import { BaseToken } from "../common/BaseToken";
import { ASTNode } from "../parser/AST";
import { StructProp } from "../parser/types";
import { GLESVisitor } from "./GLESVisitor";
import { VisitorContext } from "./VisitorContext";
import { ICodeSegment } from "./types";

export class GLES100Visitor extends GLESVisitor {
  private static _singleton: GLES100Visitor;
  static getVisitor(): GLES100Visitor {
    if (!this._singleton) {
      this._singleton = new GLES100Visitor();
    }
    return this._singleton;
  }

  override getFragDataCodeGen(index: string | number): string {
    return `gl_FragData[${index}]`;
  }

  override getReferencedMRTPropText(index: string | number, ident: string): string {
    return "";
  }

  override getAttributeProp(prop: StructProp): string {
    return `attribute ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    return `varying ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTDeclare(out: ICodeSegment[]): void {
    return;
  }

  override visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    const { children } = node;
    const postExpr = children[0];
    const { context } = VisitorContext;
    if (postExpr instanceof ASTNode.PostfixExpression && context.isMRTStruct(<string>postExpr.type)) {
      const propReferenced = children[2] as BaseToken;
      const prop = context.mrtStruct!.propList.find((item) => item.ident.lexeme === propReferenced.lexeme);
      if (!prop) {
        this._reportError(propReferenced.location, `not found mrt property: ${propReferenced.lexeme}`);
        return "";
      }
      return `gl_FragData[${prop.mrtIndex!}]`;
    }
    return super.visitPostfixExpression(node);
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    if (node.isFragReturnStatement) {
      const expression = node.children[1] as ASTNode.Expression;
      return `gl_FragColor = ${expression.codeGen(this)}`;
    }
    return super.visitJumpStatement(node);
  }
}
