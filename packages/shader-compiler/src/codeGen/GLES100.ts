import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { ASTNode } from "@galacean/engine-shader-parser/internal";
import { ParserUtils, ShaderStructRole } from "@galacean/engine-shader-parser/internal";
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
    const directRoot =
      postExpr instanceof ASTNode.PostfixExpression
        ? ParserUtils.unwrapBareIdentifier(postExpr, { allowParens: true })
        : undefined;
    const directSymbols = directRoot?.resolvedValueSymbols() ?? [];
    const unresolvedName =
      postExpr instanceof ASTNode.PostfixExpression ? ParserUtils.extractDirectIdentLexeme(postExpr) : null;
    const directRole = directRoot
      ? directSymbols.length
        ? context.getStructVarRole(directSymbols)
        : unresolvedName
          ? context.getUnresolvedStructVarRole(unresolvedName)
          : undefined
      : undefined;
    if (directRole === ShaderStructRole.Mrt) {
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
    const mode = this.context.getFragmentReturnMode(node);
    const terminal = this.context.isTerminalInterfaceReturn(node);
    if (mode === "mrt") return terminal ? "" : "return;";
    if (mode === "color") {
      const expression = node.children[1] as ASTNode.Expression;
      return `gl_FragColor = ${expression.codeGen(this)};${terminal ? "" : " return;"}`;
    }
    return super.visitJumpStatement(node);
  }
}
