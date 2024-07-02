import { Logger } from "../Logger";
import { IIndexRange } from "../common";
import { TreeNode } from "./AST";
// #if _DEVELOPMENT
import { SemanticError } from "../Error";
// #endif
import { ShaderData } from "./ShaderInfo";
import SymbolTable from "../common/SymbolTable";
import { NodeChild } from "./types";
import { IEngineType, IEngineFunction } from "../EngineType";

export type TranslationRule<T = any> = (sa: SematicAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * - Build symbol table
 * - Static analysis
 */
export default class SematicAnalyzer {
  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  logger = new Logger("semantic analyzer");

  // #if _DEVELOPMENT
  readonly errors: SemanticError[] = [];
  // #endif

  get scope() {
    return this._scopeStack[this._scopeStack.length - 1];
  }

  private _shaderData = new ShaderData();
  get shaderData() {
    return this._shaderData;
  }

  private _scopeStack: SymbolTable[] = [new SymbolTable()];
  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  reset() {
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this._scopeStack = [new SymbolTable()];
    // #if _DEVELOPMENT
    this.errors.length = 0;
    // #endif
  }

  newScope() {
    // TODO: symbol table has no parent, use stack to trace parent.
    const scope = new SymbolTable();
    scope.parent = this.scope;
    this._scopeStack.push(scope);
  }

  dropScope() {
    return this._scopeStack.pop();
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
