import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { NoneTerminal } from "@galacean/engine-shader-parser/internal";
import { ESymbolType, FnSymbol } from "@galacean/engine-shader-parser/internal";
import { NodeChild, StructProp } from "@galacean/engine-shader-parser/internal";
import { ParserUtils } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole } from "@galacean/engine-shader-parser/internal";
import type { ICodeGenVisitor } from "@galacean/engine-shader-parser/internal";
import { VisitorContext } from "./VisitorContext";
import { ReturnableObjectPool } from "@galacean/engine-core";
import { Keyword } from "@galacean/engine-shader-parser/internal";
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
  protected readonly context = new VisitorContext();

  cache(node: TreeNode, code: string): string {
    this.context.codeCache.set(node, code);
    return code;
  }

  getCachedCode(node: TreeNode): string | undefined {
    return this.context.codeCache.get(node);
  }

  defaultCodeGen(children: NodeChild[]) {
    const pool = CodeGenVisitor._tmpArrayPool;
    const ret = pool.get();
    ret.dispose();
    for (const child of children) {
      if (child instanceof BaseToken) {
        // Legacy opaque `#define` lexemes carry the directive verbatim; expression-style defines use the AST path
        ret.array.push(child.lexeme);
      } else {
        ret.array.push(child.codeGen(this));
      }
    }
    const result = ret.array.join(" ");
    ret.dispose();
    pool.return(ret);
    return result;
  }

  visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    const children = node.children;
    const derivationLength = children.length;
    const context = this.context;

    if (derivationLength === 3) {
      const postExpr = children[0] as ASTNode.PostfixExpression;
      const prop = children[2];

      if (prop instanceof BaseToken) {
        // Direct variables use parser symbol identity so lexical shadowing cannot inherit an IO role
        // from a same-named declaration. Macro-expanded identifiers can lack a resolved symbol, so
        // only that zero-symbol path falls back to the expression's unambiguous struct type.
        let role: ShaderStructRole | undefined;
        const directRoot = ParserUtils.unwrapBareIdentifier(postExpr, { allowParens: true });
        if (directRoot) {
          const symbols = directRoot.resolvedValueSymbols();
          const unresolvedName = ParserUtils.extractDirectIdentLexeme(postExpr);
          role = symbols.length
            ? context.getStructVarRole(symbols)
            : unresolvedName
              ? context.getUnresolvedStructVarRole(unresolvedName)
              : undefined;
        }

        if (role) {
          if (role === ShaderStructRole.Attribute) context.referenceAttribute(prop);
          else if (role === ShaderStructRole.Varying) context.referenceVarying(prop);
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
    for (const name of node.referenceGlobalSymbolNames) {
      this.context.referenceGlobal(name, ESymbolType.Any);
    }

    return node.getLexeme(this);
  }

  visitFunctionCall(node: ASTNode.FunctionCall): string {
    const call = node.children[0] as ASTNode.FunctionCallGeneric;
    if (call.fnSymbol instanceof FnSymbol) {
      this.context.referenceGlobal(call.fnSymbol.ident, ESymbolType.FN);

      const paramList = call.children[2];
      if (paramList instanceof ASTNode.FunctionCallParameterList) {
        const astNodes = paramList.paramNodes;
        const paramInfoList = call.fnSymbol.astNode.protoType.parameterList;

        const context = this.context;
        const params = astNodes.filter((_, i) => {
          const parameter = paramInfoList?.[i]?.astNode;
          // Drop struct-IO parameters (attribute/varying/mrt) — they're flattened
          // into top-level declarations and no longer exist as function-call args.
          return (
            !(parameter instanceof ASTNode.ParameterDeclaration) ||
            !parameter.symbol ||
            !context.getStructVarRole([parameter.symbol])
          );
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
      const context = this.context;

      // Drop bare IO-struct args only when the macro aliases a user fn (whose
      // formal was flattened). All other shapes preserve args verbatim.
      let params: typeof astNodes;
      if (node.isFunctionLikeMacro || !node.aliasesNonBuiltinIdent) {
        params = astNodes;
      } else {
        params = astNodes.filter((arg) => {
          if (arg instanceof ASTNode.AssignmentExpression) {
            const variableParam = ParserUtils.unwrapBareIdentifier(arg, { allowParens: false });
            if (variableParam && context.getStructVarRole(variableParam.resolvedValueSymbols())) {
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
      this.context.referenceGlobal(type, ESymbolType.STRUCT);
    }
    return this.defaultCodeGen(node.children);
  }

  visitGlobalVariableDeclaration(node: ASTNode.VariableDeclaration): string {
    const children = node.children;
    const fullType = children[0];
    if (fullType instanceof ASTNode.FullySpecifiedType && fullType.typeSpecifier.isCustom) {
      const context = this.context;
      // Global interface variables are flattened and therefore are not emitted as uniforms.
      if (context.getStructVarRole([node.declarator.symbol])) {
        return "";
      }
      context.referenceGlobal(<string>fullType.type, ESymbolType.STRUCT);
    }
    return `uniform ${this.defaultCodeGen(children)}`;
  }

  visitDeclaration(node: ASTNode.Declaration): string {
    const context = this.context;
    const children = node.children;
    const child = children[0];

    if (child instanceof ASTNode.InitDeclaratorList) {
      const first = child.children[0];
      const declarator =
        child.declarator ?? (first instanceof ASTNode.SingleDeclaration ? first.declarator : undefined);
      const role = declarator && context.getStructVarRole([declarator.symbol]);
      if (role === ShaderStructRole.Varying || role === ShaderStructRole.Mrt) return "";
    }
    return this.defaultCodeGen(children);
  }

  visitFunctionParameterList(node: ASTNode.FunctionParameterList): string {
    const context = this.context;
    const params = node.parameterInfoList.filter((item) => {
      const parameter = item.astNode;
      return (
        !(parameter instanceof ASTNode.ParameterDeclaration) ||
        !parameter.symbol ||
        !context.getStructVarRole([parameter.symbol])
      );
    });

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
    const returnType = node.returnType.typeSpecifier;
    if (this.context.getStructRole(returnType.structDeclarations) === ShaderStructRole.Varying) {
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
        if (returnVar && this.context.getStructVarRole(returnVar.resolvedValueSymbols()) === ShaderStructRole.Varying) {
          return this.context.isTerminalInterfaceReturn(node) ? "" : "return;";
        }
        const returnFnCall = ParserUtils.unwrapNodeByType<ASTNode.FunctionCall>(expr, NoneTerminal.function_call);
        const calledFunction = returnFnCall?.children[0] as ASTNode.FunctionCallGeneric | undefined;
        const returnDeclarations =
          calledFunction?.fnSymbol instanceof FnSymbol
            ? calledFunction.fnSymbol.astNode.protoType.returnType.typeSpecifier.structDeclarations
            : [];
        if (this.context.getStructRole(returnDeclarations) === ShaderStructRole.Varying) {
          return `${expr.codeGen(this)};${this.context.isTerminalInterfaceReturn(node) ? "" : " return;"}`;
        }
      }
    }
    return this.defaultCodeGen(children);
  }

  visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    return this.defaultCodeGen(node.children);
  }

  visitStructSpecifier(node: ASTNode.StructSpecifier): string {
    const context = this.context;
    const { varyingStructs, attributeStructs, mrtStructs } = context;
    const isVaryingStruct = varyingStructs.indexOf(node) !== -1;
    const isAttributeStruct = attributeStructs.indexOf(node) !== -1;
    const isMRTStruct = mrtStructs.indexOf(node) !== -1;

    if (isVaryingStruct || isAttributeStruct || isMRTStruct) {
      const result: ICodeSegment[] = [];

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
    const context = this.context;
    const terminal = ParserUtils.lastStatement(fnNode.statements);
    if (terminal instanceof ASTNode.JumpStatement) context.registerTerminalInterfaceReturn(terminal);

    if (fnName == context.stageEntry) {
      const statements = fnNode.statements.codeGen(this);
      return `void main() ${statements}`;
    } else {
      return this.defaultCodeGen(fnNode.children);
    }
  }
}
