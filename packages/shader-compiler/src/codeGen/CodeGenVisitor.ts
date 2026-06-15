import { BaseToken } from "@galacean/engine-shader-parser";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser";
import { NoneTerminal } from "@galacean/engine-shader-parser";
import { ESymbolType, FnSymbol } from "@galacean/engine-shader-parser";
import { NodeChild, StructProp } from "@galacean/engine-shader-parser";
import { ParserUtils } from "@galacean/engine-shader-parser";
import { StructRole } from "@galacean/engine-shader-parser";
import type { ICodeGenVisitor } from "@galacean/engine-shader-parser";
import { VisitorContext } from "./VisitorContext";
import { ReturnableObjectPool } from "@galacean/engine-core";
import { Keyword } from "@galacean/engine-shader-parser";
import { TempArray } from "../TempArray";
import { ICodeSegment } from "./types";

/**
 * @internal
 * The code generator
 */
export abstract class CodeGenVisitor implements ICodeGenVisitor {
  abstract getAttributeProp(prop: StructProp): string;
  abstract getVaryingProp(prop: StructProp): string;
  abstract getMRTProp(prop: StructProp): string;

  protected static _tmpArrayPool = new ReturnableObjectPool(TempArray<string>, 10);

  defaultCodeGen(children: NodeChild[]) {
    const pool = CodeGenVisitor._tmpArrayPool;
    let ret = pool.get();
    ret.dispose();
    for (const child of children) {
      if (child instanceof BaseToken) {
        // Legacy opaque `#define` lexemes carry the directive verbatim — expression-style defines go through the AST path.
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
        // Struct role priority: `_structVarMap` by bare root ident (covers forward-declared types like `Varyings o;`),
        // then AST static type (normal path when `semanticAnalyze` resolved `postExpr.type`).
        let role: StructRole | undefined;
        const directRoot = ParserUtils.extractDirectIdentLexeme(postExpr);
        if (directRoot) role = context._structVarMap[directRoot];
        if (!role) role = context.getStructRole(<string>postExpr.type);

        if (role) {
          if (role === StructRole.Attribute) context.referenceAttribute(prop);
          else if (role === StructRole.Varying) context.referenceVarying(prop);
          else context.referenceMRTProp(prop);
          return prop.lexeme;
        }

        return `${postExpr.codeGen(this)}.${prop.lexeme}`;
      } else {
        return `${postExpr.codeGen(this)}.${prop.codeGen(this)}`;
      }
    } else if (derivationLength === 4) {
      const identNode = children[0] as ASTNode.PostfixExpression;
      const indexNode = children[2] as ASTNode.Expression;
      return `${identNode.codeGen(this)}[${indexNode.codeGen(this)}]`;
    }

    return this.defaultCodeGen(node.children);
  }

  visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    for (let name of node.referenceGlobalSymbolNames) {
      VisitorContext.context.referenceGlobal(name, ESymbolType.Any);
    }

    return node.getLexeme(this);
  }

  visitFunctionCall(node: ASTNode.FunctionCall): string {
    const call = node.children[0] as ASTNode.FunctionCallGeneric;
    if (call.fnSymbol instanceof FnSymbol) {
      VisitorContext.context.referenceGlobal(call.fnSymbol.ident, ESymbolType.FN);

      const paramList = call.children[2];
      if (paramList instanceof ASTNode.FunctionCallParameterList) {
        const astNodes = paramList.paramNodes;
        const paramInfoList = call.fnSymbol.astNode.protoType.parameterList;

        const context = VisitorContext.context;
        const params = astNodes.filter((_, i) => {
          const typeInfo = paramInfoList?.[i]?.typeInfo;
          // Drop struct-IO parameters (attribute/varying/mrt) — they're flattened
          // into top-level declarations and no longer exist as function-call args.
          return !typeInfo || !context.getStructRole(typeInfo.typeLexeme);
        });

        let paramsCode = "";

        for (let i = 0, length = params.length; i < length; i++) {
          const astNode = params[i];
          const code = astNode.codeGen(this);
          if (astNode instanceof ASTNode.MacroCallArgBlock || i === 0) {
            paramsCode += code;
          } else {
            paramsCode += `, ${code}`;
          }
        }

        return `${call.fnSymbol.ident}(${paramsCode})`;
      }
    }

    return this.defaultCodeGen(node.children);
  }

  visitMacroCallFunction(node: ASTNode.MacroCallFunction): string {
    const children = node.children;
    const paramList = children[2];
    if (paramList instanceof ASTNode.FunctionCallParameterList) {
      const astNodes = paramList.paramNodes;
      const context = VisitorContext.context;

      // Drop bare IO-struct args only when the macro aliases a user fn (whose
      // formal was flattened). All other shapes preserve args verbatim.
      let params: typeof astNodes;
      if (node.isFunctionLikeMacro || !node.aliasesNonBuiltinIdent) {
        params = astNodes;
      } else {
        params = astNodes.filter((arg) => {
          if (arg instanceof ASTNode.AssignmentExpression) {
            const variableParam = ParserUtils.unwrapBareIdentifier(arg, { allowParens: false });
            if (
              variableParam &&
              typeof variableParam.typeInfo === "string" &&
              context.getStructRole(variableParam.typeInfo)
            ) {
              return false;
            }
          }
          return true;
        });
      }

      let paramsCode = "";
      for (let i = 0, length = params.length; i < length; i++) {
        const argNode = params[i];
        const code = argNode.codeGen(this);

        if (argNode instanceof ASTNode.MacroCallArgBlock || i === 0) {
          paramsCode += code;
        } else {
          paramsCode += `, ${code}`;
        }
      }

      return `${node.macroName}(${paramsCode})`;
    } else {
      return this.defaultCodeGen(node.children);
    }
  }

  visitStatementList(node: ASTNode.StatementList): string {
    const children = node.children as TreeNode[];
    if (children.length === 1) {
      return children[0].codeGen(this);
    } else {
      return `${children[0].codeGen(this)}\n${children[1].codeGen(this)}`;
    }
  }

  /**
   * Code-generate a `#define` macro parsed as expression AST. Produces a `#define`
   * directive whose value is the AST-rewritten string — so varying flattening
   * happens naturally via `visitPostfixExpression` inside the AST walk.
   */
  visitMacroDefine(node: ASTNode.MacroDefine): string {
    // For function-like macros, preserve the original `(params)` lexeme verbatim —
    // the parameter list is user-authored text that shouldn't be canonicalized.
    let paramsLexeme = "";
    if (node.isFunction) {
      const paramsToken = node.children[2];
      if (paramsToken instanceof BaseToken) paramsLexeme = paramsToken.lexeme;
    }
    const valueCode = node.valueExpression ? node.valueExpression.codeGen(this) : "";
    // Newlines around the directive keep `#` at the start of its physical line per
    // GLSL ES 3.0 §3.4, regardless of how surrounding tokens are joined.
    return `\n#define ${node.macroName}${paramsLexeme}${valueCode ? " " + valueCode : ""}\n`;
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
      const context = VisitorContext.context;
      // Global variables whose declared type is a varying/attribute/mrt struct
      // (e.g. `Varyings o;`) are not emitted as `uniform`. The variable's role comes
      // from `ShaderIOAnalyzer`'s `structVarMap`, so `visitPostfixExpression` can
      // flatten `o.field` at macro-value codegen time.
      if (context.getStructRole(fullType.typeSpecifier.lexeme)) {
        return "";
      }
      context.referenceGlobal(<string>fullType.type, ESymbolType.STRUCT);
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
    const context = VisitorContext.context;
    const params = node.parameterInfoList.filter(
      (item) => !item.typeInfo || !context.getStructRole(item.typeInfo.typeLexeme)
    );

    let out = "";
    for (let i = 0, length = params.length; i < length; i++) {
      const item = params[i];
      const astNode = item.astNode;
      const code = astNode.codeGen(this);
      if (astNode instanceof ASTNode.MacroParamBlock || i === 0) {
        out += code;
      } else {
        out += `, ${code}`;
      }
    }

    return out;
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
    const { varyingStructs, attributeStructs, mrtStructs } = context;
    const isVaryingStruct = varyingStructs.indexOf(node) !== -1;
    const isAttributeStruct = attributeStructs.indexOf(node) !== -1;
    const isMRTStruct = mrtStructs.indexOf(node) !== -1;

    if (isVaryingStruct || isAttributeStruct || isMRTStruct) {
      let result: ICodeSegment[] = [];

      result.push(
        ...node.macroExpressions.map((item) => ({
          text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
          index: item.location.start.index
        }))
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
        } else if (isMRTStruct && context._referencedMRTList[name]?.indexOf(prop) >= 0) {
          result.push({
            text: `${this.getMRTProp(prop)}\n`,
            index: prop.ident.location.start.index
          });
        }
      }

      const text = result
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text)
        .join("");

      return text;
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
}
