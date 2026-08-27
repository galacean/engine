import type { BranchSignature } from "../common/BaseToken";
import { SymbolInfo, SymbolTable, type FnSymbol, type VarSymbol } from "../parser/symbolTable";
import { ASTNode } from "./AST";

/**
 * Immutable candidates retained for one reference lookup.
 * @internal
 */
export interface ReferenceResolutionSnapshot {
  /**
   * Call-site reference resolved by this lookup.
   */
  readonly reference: ASTNode.VariableIdentifier;
  /**
   * Exact candidates retained for this lookup, independent of later lookups on the same AST node.
   */
  readonly symbols: readonly (VarSymbol | FnSymbol)[];
  /**
   * Index of the first outer owner used only when nearer conditional declarations are absent.
   */
  readonly fallbackStart: number;
  /**
   * Effective branch of this lookup, including an expression-macro replacement branch.
   */
  readonly callSiteBranch: BranchSignature;
  /**
   * Definition-owned AST identity of a member owner inside a macro replacement.
   */
  readonly replacementMemberOwner?: ASTNode.VariableIdentifier;
  /**
   * Whether the owner is formed only after function-argument or nested-macro substitution.
   */
  readonly requiresRuntimeOwnerExpansion?: boolean;
}

export class ShaderData {
  symbolTable: SymbolTable<SymbolInfo>;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];

  globalMacroDeclarations: ASTNode.GlobalDeclaration[] = [];

  /**
   * Direct member-owner references discovered while their postfix expressions are reduced.
   * @internal
   */
  directMemberOwnerReferences: ASTNode.VariableIdentifier[] = [];

  /**
   * Sparse lookup snapshots required when AST-local symbol state cannot represent every owner candidate.
   * @internal
   */
  referenceResolutionSnapshots: ReferenceResolutionSnapshot[] = [];

  getOuterGlobalMacroDeclarations(): ASTNode.GlobalDeclaration[] {
    return this.globalMacroDeclarations.filter((node) => node.parent instanceof ASTNode.GLShaderProgram);
  }
}
