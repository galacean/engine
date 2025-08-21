import { ShaderPosition, ShaderRange } from "../common";
import { BaseToken } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import { ASTNode, TreeNode } from "../parser/AST";
import { NoneTerminal } from "../parser/GrammarSymbol";
import { ESymbolType, FnSymbol } from "../parser/symbolTable";
import { NodeChild, StructProp } from "../parser/types";
import { ParserUtils } from "../ParserUtils";
import { ShaderLab } from "../ShaderLab";
import { VisitorContext } from "./VisitorContext";
// #if _VERBOSE
import { GSError } from "../GSError";
// #endif
import { Logger, ReturnableObjectPool } from "@galacean/engine";
import { Keyword } from "../common/enums/Keyword";
import { TempArray } from "../TempArray";
import { ICodeSegment } from "./types";

export const V3_GL_FragColor = "GS_glFragColor";
export const V3_GL_FragData = "GS_glFragData";

/**
 * @internal
 * The code generator
 */
export abstract class CodeGenVisitor {
  // #if _VERBOSE
  readonly errors: Error[] = [];
  // #endif

  abstract getFragDataCodeGen(index: string | number): string;
  abstract getReferencedMRTPropText(index: string | number, ident: string): string;
  abstract getVaryingProp(prop: StructProp): string;
  abstract getAttributeProp(prop: StructProp): string;

  protected static _tmpArrayPool = new ReturnableObjectPool(TempArray<string>, 10);

  defaultCodeGen(children: NodeChild[]) {
    const pool = CodeGenVisitor._tmpArrayPool;
    let ret = pool.get();
    ret.dispose();
    for (const child of children) {
      if (child instanceof BaseToken) {
        ret.array.push(child.lexeme);
      } else {
        ret.array.push(child.codeGen(this));
      }
    }
    pool.return(ret);
    return ret.array.join(" ");
  }

  visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    const children = node.children;
    const derivationLength = children.length;
    const context = VisitorContext.context;

    if (derivationLength === 3) {
      const postExpr = children[0] as ASTNode.PostfixExpression;
      const prop = children[2];

      if (prop instanceof BaseToken) {
        if (context.isAttributeStruct(<string>postExpr.type)) {
          const error = context.referenceAttribute(prop);
          // #if _VERBOSE
          if (error) {
            this.errors.push(<GSError>error);
          }
          // #endif
          return prop.lexeme;
        } else if (context.isVaryingStruct(<string>postExpr.type)) {
          const error = context.referenceVarying(prop);
          // #if _VERBOSE
          if (error) {
            this.errors.push(<GSError>error);
          }
          // #endif
          return prop.lexeme;
        } else if (context.isMRTStruct(<string>postExpr.type)) {
          const error = context.referenceMRTProp(prop);
          // #if _VERBOSE
          if (error) {
            this.errors.push(<GSError>error);
          }
          // #endif
          return prop.lexeme;
        }

        return `${postExpr.codeGen(this)}.${prop.lexeme}`;
      } else {
        return `${postExpr.codeGen(this)}.${prop.codeGen(this)}`;
      }
    } else if (derivationLength === 4) {
      const identNode = children[0] as ASTNode.PostfixExpression;
      const indexNode = children[2] as ASTNode.Expression;
      const identLexeme = identNode.codeGen(this);
      const indexLexeme = indexNode.codeGen(this);
      if (identLexeme === "gl_FragData") {
        // #if _VERBOSE
        if (context._referencedVaryingList[V3_GL_FragColor]) {
          this._reportError(identNode.location, "cannot use both gl_FragData and gl_FragColor");
        }
        // #endif
        const mrtLexeme = this.getFragDataCodeGen(indexLexeme);
        context._referencedMRTList[mrtLexeme] = this.getReferencedMRTPropText(indexLexeme, mrtLexeme);
        return mrtLexeme;
      }
      return `${identLexeme}[${indexLexeme}]`;
    }
    return this.defaultCodeGen(node.children);
  }

  visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    if (node.hasGlobalVariable) {
      VisitorContext.context.referenceGlobal(node.lexeme, ESymbolType.VAR);
    }

    if (node.macroCallNode) {
      return node.macroCallNode.codeGen(this);
    } else {
      return node.lexeme;
    }
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
    if (children.length === 1) {
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
    const children = node.children;
    const fullType = children[0];
    if (fullType instanceof ASTNode.FullySpecifiedType && fullType.typeSpecifier.isCustom) {
      VisitorContext.context.referenceGlobal(<string>fullType.type, ESymbolType.STRUCT);
    }
    return `uniform ${this.defaultCodeGen(children)}`;
  }

  visitDeclaration(node: ASTNode.Declaration): string {
    const { context } = VisitorContext;
    const children = node.children;
    const child = children[0];

    if (child instanceof ASTNode.InitDeclaratorList) {
      const typeLexeme = child.typeInfo.typeLexeme;
      if (context.isVaryingStruct(typeLexeme) || context.isMRTStruct(typeLexeme)) return "";
    }
    return this.defaultCodeGen(children);
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
    if (VisitorContext.context.isVaryingStruct(returnType)) {
      return `void ${node.ident.lexeme}(`;
    }
    return this.defaultCodeGen(node.children);
  }

  visitJumpStatement(node: ASTNode.JumpStatement): string {
    const children = node.children;
    const cmd = children[0] as BaseToken;
    if (cmd.type === Keyword.RETURN) {
      const expr = children[1];
      if (expr instanceof ASTNode.Expression) {
        const returnVar = ParserUtils.unwrapNodeByType<ASTNode.VariableIdentifier>(
          expr,
          NoneTerminal.variable_identifier
        );
        if (VisitorContext.context.isVaryingStruct(<string>returnVar?.typeInfo)) {
          return "";
        }
        const returnFnCall = ParserUtils.unwrapNodeByType<ASTNode.FunctionCall>(expr, NoneTerminal.function_call);
        if (VisitorContext.context.isVaryingStruct(<string>returnFnCall?.type)) {
          return `${expr.codeGen(this)};`;
        }
      }
    }
    return this.defaultCodeGen(children);
  }

  visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    return this.defaultCodeGen(node.children);
  }

  visitStructSpecifier(node: ASTNode.StructSpecifier): string {
    const context = VisitorContext.context;
    const { varyingStructs, attributeStructs } = context;
    const isVaryingStruct = varyingStructs.indexOf(node) !== -1;
    const isAttributeStruct = attributeStructs.indexOf(node) !== -1;

    if (isVaryingStruct && isAttributeStruct) {
      this._reportError(node.location, "cannot use same struct as Varying and Attribute");
    }

    if (isVaryingStruct || isAttributeStruct) {
      let result: ICodeSegment[] = [];

      result.push(
        ...node.macroExpressions.map((item) => ({ text: item.codeGen(this), index: item.location.start.index }))
      );

      for (const prop of node.propList) {
        const name = prop.ident.lexeme;
        if (isVaryingStruct && context._referencedVaryingList[name]?.indexOf(prop) >= 0) {
          result.push({
            text: `${this.getVaryingProp(prop)}\n`,
            index: prop.ident.location.start.index
          });
        } else if (isAttributeStruct && context._referencedAttributeList[name]?.indexOf(prop) >= 0) {
          result.push({
            text: `${this.getAttributeProp(prop)}\n`,
            index: prop.ident.location.start.index
          });
        }
      }
      const test = result
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text)
        .join("");

      return test;
    } else {
      return this.defaultCodeGen(node.children);
    }
  }

  visitFunctionDefinition(fnNode: ASTNode.FunctionDefinition): string {
    const fnName = fnNode.protoType.ident.lexeme;
    const context = VisitorContext.context;

    if (fnName == context.stageEntry) {
      const statements = fnNode.statements.codeGen(this);
      return `void main() ${statements}`;
    } else {
      return this.defaultCodeGen(fnNode.children);
    }
  }

  protected _reportError(loc: ShaderRange | ShaderPosition, message: string): void {
    // #if _VERBOSE
    this.errors.push(new GSError(GSErrorName.CompilationError, message, loc, ShaderLab._processingPassText));
    // #else
    Logger.error(message);
    // #endif
  }
}
