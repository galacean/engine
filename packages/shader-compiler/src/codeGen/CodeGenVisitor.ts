import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { ESymbolType, FnSymbol } from "@galacean/engine-shader-parser/internal";
import { NodeChild, StructProp } from "@galacean/engine-shader-parser/internal";
import { ParserUtils } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole } from "@galacean/engine-shader-parser/internal";
import type { BranchSignature, ICodeGenVisitor } from "@galacean/engine-shader-parser/internal";
import { VisitorContext } from "./VisitorContext";
import { ReturnableObjectPool } from "@galacean/engine-core";
import { TempArray } from "../TempArray";

/**
 * @internal
 * The code generator
 */
export abstract class CodeGenVisitor implements ICodeGenVisitor {
  abstract getAttributeProp(prop: StructProp): string;
  abstract getVaryingProp(prop: StructProp): string;
  abstract getMRTProp(prop: StructProp): string | null;

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
        ret.array.push(this.tokenLexeme(child));
      } else {
        ret.array.push(child.codeGen(this));
      }
    }
    const result = ret.array.join(" ");
    ret.dispose();
    pool.return(ret);
    return result;
  }

  /**
   * Spells a source token in the generated code.
   * @param token - Source token
   * @returns Generated text for the token
   */
  protected tokenLexeme(token: BaseToken): string {
    return token.lexeme;
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
        // only that zero-symbol path consults the current stage's unambiguous name-to-role map.
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

        if (!directRoot) role = context.getStructRole(node.resolvedMemberOwners);

        if (role) {
          if (role === ShaderStructRole.Attribute) context.referenceAttribute(prop);
          else if (role === ShaderStructRole.Varying) context.referenceVarying(prop);
          else context.referenceMRTProp(prop);
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
    for (const symbol of node.resolvedSymbols()) {
      if (symbol instanceof FnSymbol) this.referenceFunction(symbol, node.location.start.index, node._branch);
    }

    return node.getLexeme(this);
  }

  protected referenceFunction(symbol: FnSymbol, referenceIndex: number, branch: BranchSignature): void {
    void referenceIndex;
    void branch;
    this.context.referenceGlobal(symbol.ident, ESymbolType.FN);
  }

  visitFunctionCall(node: ASTNode.FunctionCall): string {
    const call = node.children[0] as ASTNode.FunctionCallGeneric;
    if (call.fnSymbol instanceof FnSymbol) {
      for (const symbol of call.fnSymbols?.length ? call.fnSymbols : [call.fnSymbol]) {
        this.referenceFunction(symbol, node.location.start.index, node._branch);
      }
    }

    return this.defaultCodeGen(node.children);
  }

  visitMacroCallFunction(node: ASTNode.MacroCallFunction): string {
    const children = node.children;
    const paramList = children[2];
    if (paramList instanceof ASTNode.FunctionCallParameterList) {
      const astNodes = paramList.paramNodes;
      const params = astNodes;

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
   * directive whose value retains ordinary expression and member-access semantics.
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
    return this.defaultCodeGen(node.children);
  }

  visitGlobalVariableDeclaration(node: ASTNode.VariableDeclaration): string {
    const children = node.children;
    const fullType = children[0];
    if (fullType instanceof ASTNode.FullySpecifiedType && fullType.typeSpecifier.isCustom) {
      const context = this.context;
      // Global interface variables are mutable shader values, not material bindings.
      if (context.getStructVarRole([node.declarator.symbol])) {
        return this.defaultCodeGen(children);
      }
      context.referenceGlobal(<string>fullType.type, ESymbolType.STRUCT);
    }
    return `uniform ${this.defaultCodeGen(children)}`;
  }

  visitDeclaration(node: ASTNode.Declaration): string {
    return this.defaultCodeGen(node.children);
  }

  visitFunctionParameterList(node: ASTNode.FunctionParameterList): string {
    return this.defaultCodeGen(node.children);
  }

  visitFunctionHeader(node: ASTNode.FunctionHeader): string {
    return this.defaultCodeGen(node.children);
  }

  visitJumpStatement(node: ASTNode.JumpStatement): string {
    return this.defaultCodeGen(node.children);
  }

  visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    return this.defaultCodeGen(node.children);
  }

  visitTypeSpecifier(node: ASTNode.TypeSpecifier): string {
    return this.defaultCodeGen(node.children);
  }

  visitStructSpecifier(node: ASTNode.StructSpecifier): string {
    return this.defaultCodeGen(node.children);
  }

  visitFunctionDefinition(fnNode: ASTNode.FunctionDefinition): string {
    return this.defaultCodeGen(fnNode.children);
  }
}
