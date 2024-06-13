import { Logger } from "../Logger";
import { LocRange } from "../common";
import { TreeNode } from "./AST";
import { SemanticError } from "../Error";
import { EShaderDataType, GLPassShaderData, GLShaderData, GLSubShaderData, ShaderData } from "./ShaderInfo";
import SymbolTable from "./SymbolTable";
import { NodeChild } from "./types";

export type TranslationRule<T = any> = (sa: SematicAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * - Build symbol table
 * - Static analysis
 */
export default class SematicAnalyzer {
  semanticStack: TreeNode[] = [];
  private _shaderDataStack: ShaderData[] = [new GLShaderData()];
  private _scopeStack: SymbolTable[] = [new SymbolTable(this)];
  private translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();
  acceptRule?: TranslationRule = undefined;
  readonly errors: SemanticError[] = [];
  logger = new Logger("semantic analyzer");

  get scope() {
    return this._scopeStack[this._scopeStack.length - 1];
  }

  get shaderData() {
    return this._shaderDataStack[this._shaderDataStack.length - 1];
  }

  reset() {
    this.semanticStack.length = 0;
    this._shaderDataStack = [new GLShaderData()];
    this._scopeStack = [new SymbolTable(this)];
    this.errors.length = 0;
  }

  newScope() {
    const scope = new SymbolTable(this);
    scope.parent = this.scope;
    this._scopeStack.push(scope);
  }

  dropScope() {
    return this._scopeStack.pop();
  }

  newShaderData(dataType: EShaderDataType) {
    let shaderData: ShaderData;
    if (dataType === EShaderDataType.Pass) {
      shaderData = new GLPassShaderData();
    } else {
      shaderData = new GLSubShaderData();
    }
    this._shaderDataStack.push(shaderData);
    shaderData.symbolTable = this.scope;
  }

  dropShaderData() {
    return this._shaderDataStack.pop();
  }

  addTranslationRule(pid: number, rule: TranslationRule) {
    this.translationRuleTable.set(pid, rule);
  }

  getTranslationRule(pid: number) {
    return this.translationRuleTable.get(pid);
  }

  error(loc: LocRange, ...param: any[]) {
    this.logger.errorLoc(loc, ...param);

    const err = new SemanticError(param.join(""), loc);
    this.errors.push(err);
    return err;
  }
}
