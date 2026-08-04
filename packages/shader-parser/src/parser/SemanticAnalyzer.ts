import type { ShaderRange } from "../common";
// #if _VERBOSE
import type { BranchCoverage, DeclarationCoexistence } from "../common/BaseToken";
import { isBranchReachable } from "../common/BaseToken";
import { GSError, GSErrorName } from "../GSError";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
// #endif
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { SymbolInfo } from "../parser/symbolTable";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import { NodeChild } from "./types";

import { MacroDefineList } from "../Preprocessor";

export type TranslationRule<T = any> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;
// #if _VERBOSE
type RedefinitionConflict = Exclude<DeclarationCoexistence, "exclusive"> | "none";
// #endif

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

  // #if _VERBOSE
  readonly errors: Error[] = [];
  diagnosticsEnabled = false;
  inMacroDefinition = false;
  /** Ambiguity diagnostic keys already emitted in this pass. Reset in `reset()`. */
  readonly _ambiguousReported = new Set<string>();
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

  // prettier-ignore
  reset(
    macroDefineList: MacroDefineList
    // #if _VERBOSE
    , diagnosticsEnabled: boolean
    // #endif
  ) {
    this._macroDefineList = macroDefineList;
    // #if _VERBOSE
    this.diagnosticsEnabled = diagnosticsEnabled;
    this.symbolTableStack.branchAnalysisEnabled = diagnosticsEnabled;
    // #endif
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this.symbolTableStack.clear();
    this.pushScope();
    // #if _VERBOSE
    this.errors.length = 0;
    this.inMacroDefinition = false;
    this._ambiguousReported.clear();
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

  // #if _VERBOSE
  reportError(loc: ShaderRange, message: string, code?: string): void {
    if (!this.diagnosticsEnabled || this.inMacroDefinition) return;
    if (!this._isCurrentBranchReachable()) return;
    this.errors.push(
      new GSError(GSErrorName.CompilationError, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  reportWarning(loc: ShaderRange, message: string, code?: string): void {
    if (!this.diagnosticsEnabled || this.inMacroDefinition) return;
    if (!this._isCurrentBranchReachable()) return;
    this.errors.push(
      new GSError(GSErrorName.CompilationWarn, message, loc, ShaderCompilerUtils.processingPassText, undefined, code)
    );
  }

  /** Report a proven duplicate as an error and unresolved branch overlap as a warning. */
  reportRedefinition(loc: ShaderRange, name: string, conflict: RedefinitionConflict): void {
    if (conflict === "coexist") {
      this.reportError(loc, `Redefinition of '${name}'.`, "Redefinition");
    } else if (conflict === "unknown") {
      this.reportWarning(
        loc,
        `Declaration '${name}' may overlap another macro-guarded declaration; align their branch conditions.`,
        "Redefinition"
      );
    }
  }

  /** Report a proven missing declaration as an error and uncertain coverage as a warning. */
  reportBranchAvailability(loc: ShaderRange, subject: string, coverage: BranchCoverage): void {
    if (!this.diagnosticsEnabled || this.inMacroDefinition) return;
    if (coverage === "covered") return;
    if (coverage === "uncovered") {
      this.reportError(
        loc,
        `${subject} is unavailable under at least one macro configuration reaching this reference.`,
        "UseBeforeDeclaration"
      );
    } else {
      this.reportWarning(
        loc,
        `${subject} may be unavailable under some macro configurations; align its declaration and reference conditions.`,
        "UseBeforeDeclaration"
      );
    }
  }

  /**
   * Emit one macro-branch ambiguity diagnostic per semantic projection and pass.
   * @param loc - Source range of the ambiguous reference.
   * @param key - Stable projection key, such as a variable name or `Struct.member`.
   * @param message - User-facing diagnostic message.
   * @param code - Diagnostic classification for this ambiguity.
   */
  reportBranchAmbiguity(loc: ShaderRange, key: string, message: string, code: string): void {
    if (!this.diagnosticsEnabled || this.inMacroDefinition) return;
    if (!this._isCurrentBranchReachable()) return;
    const dedupKey = `${code}:${key}`;
    if (this._ambiguousReported.has(dedupKey)) return;
    this._ambiguousReported.add(dedupKey);
    if (code === "AmbiguousMacroBranchType") this.reportWarning(loc, message, code);
    else this.reportError(loc, message, code);
  }

  /** Suppress diagnostics from paths the lexer has proven cannot reach the generated shader. */
  private _isCurrentBranchReachable(): boolean {
    return isBranchReachable(this.symbolTableStack._currentBranch);
  }
  // #endif
}
