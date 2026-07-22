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

  /** Ambiguity diagnostic keys already emitted in this pass. Reset in `reset()`. */
  readonly _ambiguousReported = new Set<string>();

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
    this._ambiguousReported.clear();
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

  reportError(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    this.errors.push(
      new GSError(GSErrorName.CompilationError, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  reportWarning(loc: ShaderRange, message: string, code?: DiagnosticType): void {
    this.errors.push(
      new GSError(GSErrorName.CompilationWarn, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  /**
   * Emit one macro-branch resolution error per semantic projection and pass.
   * @param loc - Source range of the ambiguous reference.
   * @param key - Stable projection key, such as a variable name or `Struct.member`.
   * @param message - User-facing diagnostic message.
   * @param code - Diagnostic classification for this ambiguity.
   */
  reportBranchAmbiguity(loc: ShaderRange, key: string, message: string, code: DiagnosticType): void {
    const dedupKey = `${code}:${key}`;
    if (this._ambiguousReported.has(dedupKey)) return;
    this._ambiguousReported.add(dedupKey);
    this.reportError(loc, message, code);
  }
}
