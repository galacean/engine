import { Logger } from "../Logger";
import { IIndexRange } from "../common";
import { TreeNode } from "./AST";
// #if _DEVELOPMENT
import { SemanticError } from "../Error";
// #endif
import { ShaderData } from "./ShaderInfo";
import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { NodeChild } from "./types";
import { SymbolTableStack } from "../common/BaseSymbolTable";

export type TranslationRule<T = any> = (sa: SematicAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * - Build symbol table
 * - Static analysis
 */
export default class SematicAnalyzer {
  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  logger = new Logger("semantic analyzer");
  symbolTable: SymbolTableStack<SymbolInfo, SymbolTable> = new SymbolTableStack();

  // #if _DEVELOPMENT
  readonly errors: SemanticError[] = [];
  // #endif

  private _shaderData = new ShaderData();
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
    // #if _DEVELOPMENT
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

  // #if _DEVELOPMENT
  error(loc: IIndexRange, ...param: any[]) {
    this.logger.errorLoc(loc, ...param);

    const err = new SemanticError(param.join(""), loc);
    this.errors.push(err);
    return err;
  }
  // #endif
}
