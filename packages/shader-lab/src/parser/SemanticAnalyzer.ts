import { ShaderRange } from "../common";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { GSErrorName } from "../GSError";
import { ESymbolType, SymbolInfo } from "../parser/symbolTable";
import { ShaderLab } from "../ShaderLab";
import { ASTNode, TreeNode } from "./AST";
import { NonGenericGalaceanType } from "./builtin";
import { ShaderData } from "./ShaderInfo";
import { NodeChild } from "./types";
// #if _VERBOSE
import { GSError } from "../GSError";
// #else
import { Logger } from "@galacean/engine";
// #endif

export type TranslationRule<T = any> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * @internal
 * The semantic analyzer of `ShaderLab` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SemanticAnalyzer {
  private static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);

  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTableStack: SymbolTableStack<SymbolInfo, SymbolTable<SymbolInfo>> = new SymbolTableStack();
  curFunctionInfo: {
    header?: ASTNode.FunctionDeclarator;
    returnStatement?: ASTNode.JumpStatement;
  } = {};
  private _shaderData = new ShaderData();
  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  // #if _VERBOSE
  readonly errors: Error[] = [];
  // #endif

  /**
   * @internal
   */
  _isInMacroBranch = false;

  get shaderData() {
    return this._shaderData;
  }

  constructor() {
    this.pushScope();
  }

  reset() {
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this.symbolTableStack.clear();
    this.pushScope();
    // #if _VERBOSE
    this.errors.length = 0;
    // #endif
  }

  pushScope() {
    this.symbolTableStack.pushScope(new SymbolTable<SymbolInfo>());
  }

  popScope() {
    return this.symbolTableStack.popScope();
  }

  addTranslationRule(pid: number, rule: TranslationRule) {
    this._translationRuleTable.set(pid, rule);
  }

  getTranslationRule(pid: number) {
    return this._translationRuleTable.get(pid);
  }

  lookupSymbolBy(
    ident: string,
    symbolType: ESymbolType,
    paramSignature?: NonGenericGalaceanType[],
    astNode?: ASTNode.FunctionDefinition
  ): SymbolInfo | undefined {
    const lookupSymbol = SemanticAnalyzer._lookupSymbol;
    const stack = this.symbolTableStack.stack;
    for (let length = stack.length, i = length - 1; i >= 0; i--) {
      const symbolTable = stack[i];
      lookupSymbol.set(ident, symbolType, astNode, undefined, paramSignature);
      const ret = symbolTable.lookup(lookupSymbol);
      if (ret) return ret;
    }
  }

  reportError(loc: ShaderRange, message: string): void {
    // #if _VERBOSE
    this.errors.push(new GSError(GSErrorName.CompilationError, message, loc, ShaderLab._processingPassText));
    // #else
    Logger.error(message);
    // #endif
  }
}
