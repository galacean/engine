import { ShaderRange } from "../common";
import { TreeNode } from "./AST";
// #if _VERBOSE
import { GSError, GSErrorName } from "../GSError";
// #endif
import { ShaderData } from "./ShaderInfo";
import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { NodeChild } from "./types";
import { SymbolTableStack } from "../common/BaseSymbolTable";
import { ShaderLab } from "../ShaderLab";

export type TranslationRule<T = any> = (sa: SematicAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * The semantic analyzer of `ShaderLab` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SematicAnalyzer {
  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTable: SymbolTableStack<SymbolInfo, SymbolTable> = new SymbolTableStack();
  private _shaderData = new ShaderData();

  // #if _VERBOSE
  readonly errors: GSError[] = [];
  // #endif

  get shaderData() {
    return this._shaderData;
  }

  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  constructor() {
    this.newScope();
  }

  reset() {
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this.symbolTable.clear();
    this.newScope();
    // #if _VERBOSE
    this.errors.length = 0;
    // #endif
  }

  newScope() {
    const scope = new SymbolTable();
    this.symbolTable.newScope(scope);
  }

  dropScope() {
    return this.symbolTable.dropScope();
  }

  addTranslationRule(pid: number, rule: TranslationRule) {
    this._translationRuleTable.set(pid, rule);
  }

  getTranslationRule(pid: number) {
    return this._translationRuleTable.get(pid);
  }

  error(loc: ShaderRange, ...param: any[]) {
    // #if _VERBOSE
    const err = new GSError(GSErrorName.CompilationError, param.join(""), loc, ShaderLab._processingPassText);
    this.errors.push(err);
    return err;
    // #else
    throw new Error(param.join(""));
    // #endif
  }
}
