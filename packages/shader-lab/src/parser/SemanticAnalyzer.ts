import { ShaderRange } from "../common";
import { ASTNode, TreeNode } from "./AST";
import { GSErrorName } from "../GSError";
import { ShaderData } from "./ShaderInfo";
import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { NodeChild } from "./types";
import { SymbolTableStack } from "../common/BaseSymbolTable";
import { ShaderLab } from "../ShaderLab";
// #if _VERBOSE
import { GSError } from "../GSError";
// #else
import { Logger } from "@galacean/engine";
// #endif

export type TranslationRule<T = any> = (sa: SematicAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * @internal
 * The semantic analyzer of `ShaderLab` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SematicAnalyzer {
  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTable: SymbolTableStack<SymbolInfo, SymbolTable> = new SymbolTableStack();
  curFunctionInfo: {
    header?: ASTNode.FunctionDeclarator;
    returnStatement?: ASTNode.JumpStatement;
  } = {} as any;
  private _shaderData = new ShaderData();
  private _translationRuleTable: Map<number /** production id */, TranslationRule> = new Map();

  // #if _VERBOSE
  readonly errors: Error[] = [];
  // #endif

  get shaderData() {
    return this._shaderData;
  }

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

  reportError(loc: ShaderRange, message: string): void {
    // #if _VERBOSE
    this.errors.push(new GSError(GSErrorName.CompilationError, message, loc, ShaderLab._processingPassText));
    // #else
    Logger.error(message);
    // #endif
  }
}
