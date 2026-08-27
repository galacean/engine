import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { EShaderStage } from "@galacean/engine-shader-parser/internal";
import { SymbolTable } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { ESymbolType, SymbolInfo, VarSymbol } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole, StructProp } from "@galacean/engine-shader-parser/internal";

/** @internal */
export class VisitorContext {
  private readonly _lookupSymbol = new SymbolInfo("", null);
  private readonly _structRoles = new Map<ASTNode.StructSpecifier, ShaderStructRole>();
  private readonly _vertexUnresolvedVariableRoles = new Map<string, ShaderStructRole>();
  private readonly _fragmentUnresolvedVariableRoles = new Map<string, ShaderStructRole>();
  private readonly _vertexAmbiguousVariableNames = new Set<string>();
  private readonly _fragmentAmbiguousVariableNames = new Set<string>();

  attributeStructs: ASTNode.StructSpecifier[] = [];
  attributeList: StructProp[] = [];
  varyingStructs: ASTNode.StructSpecifier[] = [];
  varyingList: StructProp[] = [];
  mrtStructs: ASTNode.StructSpecifier[] = [];
  mrtList: StructProp[] = [];

  stage: EShaderStage;
  stageEntry: string;

  _referencedAttributeList: Record<string, StructProp[]>;
  _referencedVaryingList: Record<string, StructProp[]>;
  _referencedMRTList: Record<string, StructProp[]>;
  _referencedGlobals: Record<string, SymbolInfo[]>;
  readonly _referencedGlobalKeys: string[] = [];
  _referencedGlobalMacroASTs: TreeNode[] = [];
  private readonly _structVariableRoles = new Map<VarSymbol, ShaderStructRole>();

  _passSymbolTable?: SymbolTable<SymbolInfo>;
  readonly codeCache = new Map<TreeNode, string>();
  private readonly fragmentReturnModes = new Map<ASTNode.JumpStatement, FragmentReturnMode>();
  private readonly terminalInterfaceReturns = new Set<ASTNode.JumpStatement>();

  constructor() {
    this.reset();
  }

  reset(resetAll = true) {
    this.codeCache.clear();
    this.fragmentReturnModes.clear();
    this.terminalInterfaceReturns.clear();
    if (resetAll) {
      this.attributeStructs.length = 0;
      this.attributeList.length = 0;
      this.varyingStructs.length = 0;
      this.varyingList.length = 0;
      this.mrtStructs.length = 0;
      this.mrtList.length = 0;
      this._structRoles.clear();
      this._vertexUnresolvedVariableRoles.clear();
      this._fragmentUnresolvedVariableRoles.clear();
      this._vertexAmbiguousVariableNames.clear();
      this._fragmentAmbiguousVariableNames.clear();
    }

    this._referencedAttributeList = Object.create(null);
    this._referencedVaryingList = Object.create(null);
    this._referencedMRTList = Object.create(null);
    this._referencedGlobals = Object.create(null);
    this._referencedGlobalKeys.length = 0;
    this._referencedGlobalMacroASTs.length = 0;
    if (resetAll) {
      this._structVariableRoles.clear();
      this._passSymbolTable = undefined;
    }
  }

  /**
   * Finds the shared interface role of custom-struct declaration candidates.
   * @param declarations - Exact parser struct identities resolved at one type occurrence.
   * @returns Interface role, or `undefined` when the type is not an unambiguous interface struct.
   */
  getStructRole(declarations: readonly ASTNode.StructSpecifier[]): ShaderStructRole | undefined {
    let resolvedRole: ShaderStructRole | undefined;
    for (const declaration of declarations) {
      const role = this._structRoles.get(declaration);
      if (!role || (resolvedRole && resolvedRole !== role)) return;
      resolvedRole = role;
    }
    return resolvedRole;
  }

  /**
   * Tests the exact interface role of one struct declaration.
   * @param declaration - Parser struct identity.
   * @param role - Expected interface role.
   * @returns Whether the declaration owns that role.
   */
  hasStructRole(declaration: ASTNode.StructSpecifier, role: ShaderStructRole): boolean {
    return this._structRoles.get(declaration) === role;
  }

  /**
   * Registers stage-interface struct types for constant-time role lookup.
   * @param role - Interface role shared by the supplied structs.
   * @param structs - Struct declarations derived from parser IR.
   * @internal
   */
  registerStructTypes(role: ShaderStructRole, structs: readonly ASTNode.StructSpecifier[]): void {
    for (const struct of structs) {
      this._structRoles.set(struct, role);
    }
  }

  /**
   * Registers a resolved variable that holds an interface struct.
   * @param variable - Parser symbol identity for the declaration.
   * @param role - Struct interface role.
   * @param stage - Optional stage from whose entry the variable is reachable. Omit when only exact
   * symbol lookup is required.
   */
  registerStructVar(variable: VarSymbol, role: ShaderStructRole, stage?: EShaderStage): void {
    this._structVariableRoles.set(variable, role);
    if (stage === undefined) return;
    const roles =
      stage === EShaderStage.VERTEX ? this._vertexUnresolvedVariableRoles : this._fragmentUnresolvedVariableRoles;
    const ambiguous =
      stage === EShaderStage.VERTEX ? this._vertexAmbiguousVariableNames : this._fragmentAmbiguousVariableNames;
    const name = variable.ident;
    if (ambiguous.has(name)) return;
    const existing = roles.get(name);
    if (existing && existing !== role) {
      roles.delete(name);
      ambiguous.add(name);
    } else {
      roles.set(name, role);
    }
  }

  /**
   * Finds an interface role for a global macro value that has no lexical symbol identity.
   * @param variableName - Bare variable name in the macro replacement AST.
   * @returns A role only when every stage-reachable declaration with that name agrees.
   */
  getUnresolvedStructVarRole(variableName: string): ShaderStructRole | undefined {
    const roles =
      this.stage === EShaderStage.VERTEX ? this._vertexUnresolvedVariableRoles : this._fragmentUnresolvedVariableRoles;
    const ambiguous =
      this.stage === EShaderStage.VERTEX ? this._vertexAmbiguousVariableNames : this._fragmentAmbiguousVariableNames;
    return ambiguous.has(variableName) ? undefined : roles.get(variableName);
  }

  /**
   * Finds the shared interface role of branch-visible variable candidates.
   * @param symbols - Exact parser symbols resolved at one reference.
   * @returns Interface role, or `undefined` when the reference is not an unambiguous interface value.
   */
  getStructVarRole(symbols: readonly SymbolInfo[]): ShaderStructRole | undefined {
    let resolvedRole: ShaderStructRole | undefined;
    for (const symbol of symbols) {
      if (!(symbol instanceof VarSymbol)) return;
      const role = this._structVariableRoles.get(symbol);
      if (!role || (resolvedRole && resolvedRole !== role)) return;
      resolvedRole = role;
    }
    return resolvedRole;
  }

  /**
   * Marks a value-return belonging to a fragment entry for backend lowering.
   * @param statement - Exact return statement identity.
   * @param mode - Fragment output contract of the containing entry declaration.
   */
  registerFragmentReturn(statement: ASTNode.JumpStatement, mode: FragmentReturnMode): void {
    this.fragmentReturnModes.set(statement, mode);
  }

  /**
   * Finds the output contract for a fragment-entry return statement.
   * @param statement - Return statement identity.
   * @returns Output mode, or `undefined` for ordinary helper/vertex returns.
   */
  getFragmentReturnMode(statement: ASTNode.JumpStatement): FragmentReturnMode | undefined {
    return this.fragmentReturnModes.get(statement);
  }

  /** Marks a syntactically final interface return whose control-flow exit can be omitted. */
  registerTerminalInterfaceReturn(statement: ASTNode.JumpStatement): void {
    this.terminalInterfaceReturns.add(statement);
  }

  /**
   * Tests whether an interface return is the final syntactic statement in its function.
   * @param statement - Return statement identity.
   * @returns Whether backend lowering may omit a trailing `return;`.
   */
  isTerminalInterfaceReturn(statement: ASTNode.JumpStatement): boolean {
    return this.terminalInterfaceReturns.has(statement);
  }

  referenceAttribute(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.attributeList, this._referencedAttributeList);
  }

  referenceVarying(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.varyingList, this._referencedVaryingList);
  }

  referenceMRTProp(ident: BaseToken): void {
    this._referenceProp(ident.lexeme, this.mrtList, this._referencedMRTList);
  }

  referenceGlobal(ident: string, type: ESymbolType): void {
    if (this._referencedGlobals[ident]) return;

    this._referencedGlobals[ident] = [];
    this._referencedGlobalKeys.push(ident);

    const lookupSymbol = this._lookupSymbol;
    lookupSymbol.set(ident, type);
    this._passSymbolTable!.getSymbols(lookupSymbol, true, this._referencedGlobals[ident]);
  }

  // Track which IO props are actually referenced (drives in/out emission). A missing member is no
  // longer flagged here — that's the parser's struct-field check (UndeclaredStructMember).
  private _referenceProp(name: string, list: StructProp[], refList: Record<string, StructProp[]>): void {
    if (refList[name]) return;
    refList[name] = list.filter((item) => item.ident.lexeme === name);
  }
}

/** @internal */
export type FragmentReturnMode = "color" | "mrt";
