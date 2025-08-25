import { ShaderRange } from "../common";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { GSErrorName } from "../GSError";
import { SymbolInfo } from "../parser/symbolTable";
import { ShaderLab } from "../ShaderLab";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import { NodeChild } from "./types";
// #if _VERBOSE
import { GSError } from "../GSError";
// #else
import { Logger } from "@galacean/engine";
import { MacroDefineList } from "../MacroDefineInfo";
// #endif

export type TranslationRule<T = any> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * @internal
 * The semantic analyzer of `ShaderLab` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SemanticAnalyzer {
  /**
   * @internal
   */
  static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);

  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTableStack: SymbolTableStack<SymbolInfo, SymbolTable<SymbolInfo>> = new SymbolTableStack();
  curFunctionInfo: {
    header?: ASTNode.FunctionDeclarator;
    returnStatement?: ASTNode.JumpStatement;
  } = {};
  private _shaderData = new ShaderData();
  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  private _macroDefineList: MacroDefineList;

  // #if _VERBOSE
  readonly errors: Error[] = [];
  // #endif

  get shaderData() {
    return this._shaderData;
  }

  get macroDefineList(): MacroDefineList {
    return this._macroDefineList;
  }

  constructor() {
    this.pushScope();
  }

  reset(macroDefineList: MacroDefineList) {
    this._macroDefineList = macroDefineList;
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

  reportError(loc: ShaderRange, message: string): void {
    // #if _VERBOSE
    this.errors.push(new GSError(GSErrorName.CompilationError, message, loc, ShaderLab._processingPassText));
    // #else
    Logger.error(message);
    // #endif
  }
}
