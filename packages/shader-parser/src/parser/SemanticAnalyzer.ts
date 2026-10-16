import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, BranchSignature, DeclarationCoexistence } from "../common/BaseToken";
import { getLexicalDeclarationCoexistence } from "../common/BranchIdentity";
import type { BranchSemantics } from "../common/BranchSemantics";
import { SymbolTable } from "../common/SymbolTable";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { FnSymbol, SymbolInfo, VarSymbol } from "../parser/symbolTable";
import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import type { SemanticAmbiguityKind, SemanticDiagnostics } from "./SemanticDiagnostics";
import { NodeChild } from "./types";

import { MacroDefineList } from "../Preprocessor";
import type { ParserObjectPool } from "../ParserObjectPool";
import type { ShaderSourceScope } from "../ir";
import { createShaderDeclarationOwnership, isDeferredDeclarationPair } from "../ir/ShaderDeclarationOwnership";

export type TranslationRule<T = unknown> = (sa: SemanticAnalyzer, ...tokens: NodeChild[]) => T;
type RedefinitionConflict = Exclude<DeclarationCoexistence, "exclusive"> | "none";

interface FunctionCapture {
  readonly header: ASTNode.FunctionDeclarator;
  readonly localVariables: VarSymbol[];
  readonly calledFunctions: FnSymbol[];
}

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
  /**
   * Request-owned nearest-scope output for secondary runtime-reference probes.
   * @internal
   */
  readonly runtimeLookupScratch: SymbolInfo[] = [];
  /**
   * Request-owned runtime-owner candidates, including conditional outer-scope fallbacks.
   * @internal
   */
  readonly runtimeFallbackScratch: SymbolInfo[] = [];

  semanticStack: TreeNode[] = [];
  acceptRule?: TranslationRule = undefined;
  symbolTableStack: SymbolTableStack<SymbolInfo, SymbolTable<SymbolInfo>> = new SymbolTableStack();
  private readonly _functionCaptures: FunctionCapture[] = [];
  private _shaderData = new ShaderData();
  private _translationRules: readonly (TranslationRule | undefined)[] = [];
  private _sourceScopes: readonly ShaderSourceScope[] = [];
  private readonly _inheritedDeclarations: { symbol: SymbolInfo; location: ShaderRange }[] = [];

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

  /**
   * Function identity whose body is currently being parsed, if a declarator is active.
   * @internal
   */
  get currentFunctionHeader(): ASTNode.FunctionDeclarator | undefined {
    return this._functionCaptures[this._functionCaptures.length - 1]?.header;
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
    this._inheritedDeclarations.length = 0;
    this._functionCaptures.length = 0;
    this.runtimeLookupScratch.length = 0;
    this.runtimeFallbackScratch.length = 0;
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

  /**
   * Replaces the inheritance ranges for the next semantic-analysis request.
   * @param sourceScopes - Ordered expanded source ranges carrying ShaderLab inheritance scopes.
   * @internal
   */
  setSourceScopes(sourceScopes: readonly ShaderSourceScope[]): void {
    this._sourceScopes = sourceScopes;
  }

  /**
   * Assigns the ShaderLab inheritance scope containing a declaration.
   * @param symbol - Symbol created for the declaration.
   * @param location - Declaration range in expanded pass source.
   * @returns The same symbol with its source scope assigned.
   * @internal
   */
  assignSourceScope<T extends SymbolInfo>(symbol: T, location: ShaderRange): T {
    const offset = location.start.index;
    const segments = this._sourceScopes;
    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const segment = segments[mid];
      if (offset < segment.generatedStart) {
        high = mid - 1;
      } else if (offset >= segment.generatedEnd) {
        low = mid + 1;
      } else {
        symbol.sourceScope = segment.sourceScope ?? 0;
        return symbol;
      }
    }
    symbol.sourceScope = 0;
    return symbol;
  }

  getTranslationRule(pid: number): TranslationRule | undefined {
    return this._translationRules[pid];
  }

  /**
   * Opens a declarator's capture without overwriting an enclosing function's facts.
   * @param header - Declarator that owns references until its prototype or definition ends.
   * @internal
   */
  beginFunction(header: ASTNode.FunctionDeclarator): void {
    this._functionCaptures.push({ header, localVariables: [], calledFunctions: [] });
  }

  /**
   * Closes the active declarator and restores the enclosing function's capture.
   * @returns Facts owned by the completed prototype or definition.
   * @internal
   */
  endFunction(): FunctionCapture {
    return this._functionCaptures.pop()!;
  }

  /**
   * Records a local variable in the active function capture.
   * @param variable - Variable declared in the current body.
   * @internal
   */
  recordFunctionVariable(variable: VarSymbol): void {
    this._functionCaptures[this._functionCaptures.length - 1]?.localVariables.push(variable);
  }

  /**
   * Records a resolved call in the active function capture.
   * @param fn - Exact function declaration selected by parser lookup.
   * @internal
   */
  recordFunctionCall(fn: FnSymbol): void {
    this._functionCaptures[this._functionCaptures.length - 1]?.calledFunctions.push(fn);
  }

  /**
   * Reports a declaration conflict only when branch coexistence is proven.
   * @param loc - Conflicting declaration range.
   * @param symbol - Declaration whose remaining inherited conflicts are checked after its scope is complete.
   * @param conflict - Proven or unresolved coexistence state.
   */
  reportRedefinition(loc: ShaderRange, symbol: SymbolInfo, conflict: RedefinitionConflict): void {
    this._report(this.semanticDiagnostics?.redefinition(loc, symbol.ident, conflict, symbol.branchSignature));
    if (
      this.semanticDiagnostics &&
      symbol.sourceScope > 0 &&
      this.symbolTableStack.stack.length === 1 &&
      !this.inMacroDefinition &&
      this._isCurrentBranchReachable()
    ) {
      this._inheritedDeclarations.push({ symbol, location: loc });
    }
  }

  /** Resolves inherited diagnostics after every declaration in the pass is available. @internal */
  finalizeInheritance(): void {
    const ownership = (this._shaderData.declarationOwnership = createShaderDeclarationOwnership(
      this.symbolTableStack.scope
    ));
    if (!this.branchSemantics || !this.semanticDiagnostics) return;
    for (const { symbol, location } of this._inheritedDeclarations) {
      const conflict = this.symbolTableStack.scope.getInheritedConflict(symbol, this.branchSemantics, (left, right) =>
        isDeferredDeclarationPair(ownership, left, right)
      );
      const error = this.semanticDiagnostics.redefinition(location, symbol.ident, conflict, symbol.branchSignature);
      if (error) this.errors.push(error);
    }
    this._inheritedDeclarations.length = 0;
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
  reportUndeclaredStructMember(loc: ShaderRange, structName: string, memberName: string): void {
    this._report(this.semanticDiagnostics?.undeclaredStructMember?.(loc, structName, memberName));
  }

  /** @internal */
  canBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    return (
      this.branchSemantics?.canBranchesOverlap(left, right) ??
      getLexicalDeclarationCoexistence(left, right) !== "exclusive"
    );
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
