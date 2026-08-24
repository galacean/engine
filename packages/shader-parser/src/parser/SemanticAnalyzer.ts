import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, BranchSignature, DeclarationCoexistence } from "../common/BaseToken";
import type { BranchSemantics } from "../common/BranchSemantics";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { SymbolInfo } from "../parser/symbolTable";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import type { SemanticAmbiguityKind, SemanticDiagnostics } from "./SemanticDiagnostics";
import { NodeChild } from "./types";

import { MacroDefineList } from "../Preprocessor";
import type { ParserObjectPool } from "../ParserObjectPool";

export type TranslationRule<T = unknown> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;
type RedefinitionConflict = Exclude<DeclarationCoexistence, "exclusive"> | "none";

/**
 * @internal
 * The semantic analyzer of `ShaderCompiler` compiler.
 * - Build symbol table
 * - Static analysis
 */
export default class SemanticAnalyzer {
  /** Request-owned lookup key reused during this parser session. @internal */
  readonly lookupSymbol = new SymbolInfo("", null);
  /** Request-owned scratch output for array-size symbol resolution. @internal */
  readonly arraySymbolScratch: SymbolInfo[] = [];
  /** Request-owned scratch output for overload resolution. @internal */
  readonly overloadScratch: SymbolInfo[] = [];
  /** Request-owned scratch output for struct resolution. @internal */
  readonly structScratch: SymbolInfo[] = [];

  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTableStack: SymbolTableStack<SymbolInfo, SymbolTable<SymbolInfo>> = new SymbolTableStack();
  curFunctionInfo: {
    header?: ASTNode.FunctionDeclarator;
    returnStatement?: ASTNode.JumpStatement;
  } = {};
  private _shaderData = new ShaderData();
  private _translationRules: readonly (TranslationRule | undefined)[] = [];

  private _macroDefineList: MacroDefineList;

  readonly errors: Error[] = [];
  readonly diagnosticsEnabled: boolean;
  inMacroDefinition = false;
  /** Ambiguity diagnostic keys already emitted in this pass. Reset in `reset()`. */
  readonly _ambiguousReported = new Set<string>();

  get shaderData() {
    return this._shaderData;
  }

  get macroDefineList(): MacroDefineList {
    return this._macroDefineList;
  }

  constructor(
    readonly branchSemantics?: BranchSemantics,
    readonly semanticDiagnostics?: SemanticDiagnostics,
    /**
     * Request allocator used only by synchronous compiler-owned parses.
     * @internal
     */
    readonly objectPool?: ParserObjectPool,
    diagnosticsEnabled = semanticDiagnostics !== undefined
  ) {
    this.diagnosticsEnabled = diagnosticsEnabled;
    this.symbolTableStack.branchSemantics = branchSemantics;
    this.pushScope();
  }

  reset(macroDefineList: MacroDefineList) {
    this._macroDefineList = macroDefineList;
    this.semanticStack.length = 0;
    this._shaderData = new ShaderData();
    this.symbolTableStack.clear();
    this.pushScope();
    this.errors.length = 0;
    this.inMacroDefinition = false;
    this._ambiguousReported.clear();
  }

  pushScope() {
    this.symbolTableStack.pushScope(new SymbolTable<SymbolInfo>());
  }

  popScope() {
    return this.symbolTableStack.popScope();
  }

  /**
   * Binds the immutable grammar translation table shared by parser sessions.
   * @param rules - Translation callbacks indexed by production ID.
   * @internal
   */
  setTranslationRules(rules: readonly (TranslationRule | undefined)[]): void {
    this._translationRules = rules;
  }

  getTranslationRule(pid: number): TranslationRule | undefined {
    return this._translationRules[pid];
  }

  /**
   * Reports a declaration conflict only when branch coexistence is proven.
   * @param loc - Conflicting declaration range.
   * @param name - Declared symbol name.
   * @param conflict - Proven or unresolved coexistence state.
   * @param branch - Macro branch containing the later declaration.
   */
  reportRedefinition(loc: ShaderRange, name: string, conflict: RedefinitionConflict, branch: BranchSignature): void {
    this._report(this.semanticDiagnostics?.redefinition(loc, name, conflict, branch));
  }

  /**
   * Reports a missing declaration only when a reachable uncovered configuration is proven.
   * @param loc - Reference range.
   * @param subjectKind - Referenced symbol category.
   * @param name - Referenced symbol name.
   * @param coverage - Branch coverage result.
   */
  reportBranchAvailability(
    loc: ShaderRange,
    subjectKind: "Function" | "Struct" | "Identifier",
    name: string,
    coverage: BranchCoverage
  ): void {
    this._report(this.semanticDiagnostics?.branchAvailability(loc, subjectKind, name, coverage));
  }

  /**
   * Emit one macro-branch ambiguity diagnostic per semantic projection and pass.
   * @param loc - Source range of the ambiguous reference.
   * @param key - Stable projection key, such as a variable name or `Struct.member`.
   * @param kind - Structured ambiguity category.
   * @param name - Symbol or member name.
   * @param owner - Struct owner for member ambiguities.
   */
  reportBranchAmbiguity(
    loc: ShaderRange,
    key: string,
    kind: SemanticAmbiguityKind,
    name: string,
    owner?: string
  ): void {
    const createDiagnostic = this.semanticDiagnostics?.branchAmbiguity;
    if (!createDiagnostic) return;
    const dedupKey = `${kind}:${key}`;
    if (this._ambiguousReported.has(dedupKey)) return;
    const error = createDiagnostic.call(this.semanticDiagnostics, loc, kind, name, owner);
    if (!error) return;
    this._ambiguousReported.add(dedupKey);
    this._report(error);
  }

  /** @internal */
  reportNonConstArraySize(loc: ShaderRange): void {
    this._report(this.semanticDiagnostics?.nonConstArraySize?.(loc));
  }

  /** @internal */
  reportExpectedSampler(loc: ShaderRange, functionName: string, actualType: GalaceanDataType): void {
    this._report(this.semanticDiagnostics?.expectedSampler?.(loc, functionName, actualType));
  }

  /** @internal */
  reportNoMatchingOverload(loc: ShaderRange, functionName: string): void {
    this._report(this.semanticDiagnostics?.noMatchingOverload?.(loc, functionName));
  }

  /** @internal */
  reportUndefinedFunction(loc: ShaderRange, functionName: string): void {
    this._report(this.semanticDiagnostics?.undefinedFunction?.(loc, functionName));
  }

  /** @internal */
  reportUndeclaredStructMember(loc: ShaderRange, structName: string, memberName: string): void {
    this._report(this.semanticDiagnostics?.undeclaredStructMember?.(loc, structName, memberName));
  }

  /** @internal */
  reportUnknownVariable(loc: ShaderRange, name: string): void {
    this._report(this.semanticDiagnostics?.unknownVariable?.(loc, name));
  }

  /** @internal */
  canBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    return this.branchSemantics?.canBranchesOverlap(left, right) ?? true;
  }

  /** @internal */
  canDeclarationsCoexist(earlier: BranchSignature, later: BranchSignature): boolean {
    return this.branchSemantics?.canDeclarationsCoexist(earlier, later) ?? true;
  }

  /** @internal */
  getBranchCoverage(candidates: readonly BranchSignature[], callSiteBranch: BranchSignature): BranchCoverage {
    return this.branchSemantics?.getBranchCoverage(candidates, callSiteBranch) ?? "covered";
  }

  /** @internal */
  isBranchVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean {
    return this.branchSemantics?.isBranchVisibleFrom(defBranch, callSiteBranch) ?? true;
  }

  private _report(error?: Error): void {
    if (!error || this.inMacroDefinition || !this._isCurrentBranchReachable()) return;
    this.errors.push(error);
  }

  /** Suppress diagnostics from paths the lexer has proven cannot reach the generated shader. */
  private _isCurrentBranchReachable(): boolean {
    return this.branchSemantics?.isBranchReachable(this.symbolTableStack._currentBranch) ?? true;
  }
}
