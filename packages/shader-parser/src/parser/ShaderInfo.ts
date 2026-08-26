import { SymbolInfo, SymbolTable, type FnSymbol, type VarSymbol } from "../parser/symbolTable";
import { ASTNode } from "./AST";

/**
 * A value reference and the boundary between its primary and runtime-fallback owners.
 * @internal
 */
export interface RuntimeFallbackReference {
  /**
   * Reference whose retained symbols contain conditional runtime owners.
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
}

export class ShaderData {
  symbolTable: SymbolTable<SymbolInfo>;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];

  globalMacroDeclarations: ASTNode.GlobalDeclaration[] = [];

  /**
   * Value references that retained conditional outer-scope runtime owners.
   * @internal
   */
  runtimeFallbackReferences: RuntimeFallbackReference[] = [];

  getOuterGlobalMacroDeclarations(): ASTNode.GlobalDeclaration[] {
    return this.globalMacroDeclarations.filter((node) => node.parent instanceof ASTNode.GLShaderProgram);
  }
}
