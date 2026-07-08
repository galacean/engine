import { ShaderRange } from "../common";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { GSError, GSErrorName } from "../GSError";
import type { DiagnosticType } from "../DiagnosticType";
import { SymbolInfo } from "../parser/symbolTable";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import { NodeChild } from "./types";

import { MacroDefineList } from "../Preprocessor";

export type TranslationRule<T = any> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;

/**
 * @internal
 * The semantic analyzer of `ShaderCompiler` compiler.
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

  readonly errors: Error[] = [];

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
    this.errors.length = 0;
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

  /**
   * Report a semantic error at `loc`. Automatically downgrades to a warning when the current walk
   * position is inside a `#if/#else/#ifdef/#ifndef` branch — the analyzer cannot know which arm
   * the material system will activate at runtime, so a "conflict" observed by walking every arm
   * as if simultaneously active is unreliable as a hard failure. Preserving the diagnostic (as a
   * warning) surfaces the signal without hard-blocking shaders that are correct once a specific
   * macro combination is picked. Top-level positions (`EMPTY_BRANCH`) stay as errors — those are
   * unconditional and reliable.
   *
   * Grammar-level `SyntaxError`s bypass this by pushing directly into `errors` from the parser
   * (see `ShaderTargetParser`), so syntax remains a hard error regardless of branch.
   */
  reportError(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    if (this.symbolTableStack.isInMacroBranch) {
      return this.reportWarning(loc, message, code);
    }
    this.errors.push(
      new GSError(GSErrorName.CompilationError, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  reportWarning(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    this.errors.push(
      new GSError(GSErrorName.CompilationWarn, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }
}
