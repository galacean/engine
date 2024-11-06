import { ENonTerminal } from "../parser/GrammarSymbol";
import { BaseToken as Token } from "../common/BaseToken";
import { EKeyword } from "../common";
import { ASTNode, TreeNode } from "../parser/AST";
import { ESymbolType, FnSymbol, VarSymbol } from "../parser/symbolTable";
import { ParserUtils } from "../Utils";
import { NodeChild } from "../parser/types";
import { VisitorContext } from "./VisitorContext";

/**
 * The code generator
 */
export class CodeGenVisitor {
  protected constructor() {}

  defaultCodeGen(children: NodeChild[]) {
    let ret: string[] = [];
    for (const child of children) {
      if (child instanceof Token) {
        ret.push(child.lexeme);
      } else {
        ret.push(child.codeGen(this));
      }
    }
    return ret.join(" ");
  }

  visitPostfixExpression(node: ASTNode.PostfixExpression) {
    if (node.children.length === 3) {
      const context = VisitorContext.context;

      const postExpr = node.children[0] as ASTNode.PostfixExpression;

      const prop = node.children[2];

      if (prop instanceof Token) {
        if (context.isAttributeStruct(<string>postExpr.type)) {
          context.referenceAttribute(prop.lexeme);
          return prop.lexeme;
        } else if (context.isVaryingStruct(<string>postExpr.type)) {
          context.referenceVarying(prop.lexeme);
          return prop.lexeme;
        }

        return `${postExpr.codeGen(this)}.${prop.lexeme}`;
      } else {
        return `${postExpr.codeGen(this)}.${prop.codeGen(this)}`;
      }
    }
    return this.defaultCodeGen(node.children);
  }

  visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    if (node.symbolInfo instanceof VarSymbol && node.symbolInfo.isGlobalVariable) {
      VisitorContext.context.referenceGlobal(node.lexeme, ESymbolType.VAR);
    }
    return node.lexeme;
  }

  visitFunctionCall(node: ASTNode.FunctionCall): string {
    const call = node.children[0] as ASTNode.FunctionCallGeneric;
    if (call.fnSymbol instanceof FnSymbol) {
      VisitorContext.context.referenceGlobal(call.fnSymbol.ident, ESymbolType.FN);

      const paramList = call.children[2];
      const paramInfoList = call.fnSymbol.astNode.protoType.parameterList;

      if (paramList instanceof ASTNode.FunctionCallParameterList) {
        const plainParams: string[] = [];
        const params = paramList.paramNodes;

        for (let i = 0; i < params.length; i++) {
          if (
            !VisitorContext.context.isAttributeStruct(paramInfoList[i].typeInfo.typeLexeme) &&
            !VisitorContext.context.isVaryingStruct(paramInfoList[i].typeInfo.typeLexeme)
          ) {
            plainParams.push(params[i].codeGen(this));
          }
        }
        return `${call.fnSymbol.ident}(${plainParams.join(", ")})`;
      }
    }
    return this.defaultCodeGen(node.children);
  }

  visitStatementList(node: ASTNode.StatementList): string {
    const children = node.children as TreeNode[];
    if (node.children.length === 1) {
      return children[0].codeGen(this);
    } else {
      return `${children[0].codeGen(this)}\n${children[1].codeGen(this)}`;
    }
  }

  visitSingleDeclaration(node: ASTNode.SingleDeclaration): string {
    const type = node.typeSpecifier.type;
    if (typeof type === "string") {
      VisitorContext.context.referenceGlobal(type, ESymbolType.STRUCT);
    }
    return this.defaultCodeGen(node.children);
  }

  visitGlobalVariableDeclaration(node: ASTNode.VariableDeclaration): string {
    const fullType = node.children[0];
    if (fullType instanceof ASTNode.FullySpecifiedType && fullType.typeSpecifier.isCustom) {
      VisitorContext.context.referenceGlobal(<string>fullType.type, ESymbolType.STRUCT);
    }
    return this.defaultCodeGen(node.children);
  }

  visitDeclaration(node: ASTNode.Declaration): string {
    const child = node.children[0];
    if (
      child instanceof ASTNode.InitDeclaratorList &&
      child.typeInfo.typeLexeme === VisitorContext.context.varyingStruct?.ident?.lexeme
    ) {
      return "";
    }
    return this.defaultCodeGen(node.children);
  }

  visitFunctionProtoType(node: ASTNode.FunctionProtoType): string {
    VisitorContext.context._curFn = node;
    return this.defaultCodeGen(node.children);
  }

  visitFunctionDefinition(node: ASTNode.FunctionDefinition): string {
    VisitorContext.context._curFn = undefined;
    return this.defaultCodeGen(node.children);
  }

  visitFunctionParameterList(node: ASTNode.FunctionParameterList): string {
    const params = node.parameterInfoList;
    return params
      .filter(
        (item) =>
          !VisitorContext.context.isAttributeStruct(item.typeInfo.typeLexeme) &&
          !VisitorContext.context.isVaryingStruct(item.typeInfo.typeLexeme)
      )
      .map((item) => item.astNode.codeGen(this))
      .join(", ");
  }

  visitFunctionHeader(node: ASTNode.FunctionHeader): string {
    const returnType = node.returnType.typeSpecifier.lexeme;
    if (VisitorContext.context.isAttributeStruct(returnType) || VisitorContext.context.isVaryingStruct(returnType))
      return `void ${node.ident.lexeme}(`;
    return this.defaultCodeGen(node.children);
  }

  visitJumpStatement(node: ASTNode.JumpStatement): string {
    const cmd = node.children[0] as Token;
    if (cmd.type === EKeyword.RETURN) {
      const expr = node.children[1];
      if (expr instanceof ASTNode.Expression) {
        const returnVar = ParserUtils.unwrapNodeByType<ASTNode.VariableIdentifier>(
          expr,
          ENonTerminal.variable_identifier
        );
        if (returnVar?.typeInfo === VisitorContext.context.varyingStruct?.ident?.lexeme) {
          return "";
        }
        const returnFnCall = ParserUtils.unwrapNodeByType<ASTNode.FunctionCall>(expr, ENonTerminal.function_call);
        if (returnFnCall?.type === VisitorContext.context.varyingStruct?.ident?.lexeme) {
          return `${expr.codeGen(this)};`;
        }
      }
    }
    return this.defaultCodeGen(node.children);
  }

  visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    return this.defaultCodeGen(node.children);
  }
}
