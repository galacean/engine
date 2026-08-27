import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class VarSymbol extends SymbolInfo {
  declare astNode:
    | ASTNode.Initializer
    | ASTNode.ParameterDeclarator
    | ASTNode.InitDeclaratorList
    | ASTNode.VariableDeclaration;

  readonly isGlobalVariable: boolean;
  /** `const`-qualified — lets a const-expression check resolve identifier references to constants. */
  readonly isConst: boolean;
  /**
   * Global variable without an initializer — Galacean's implicit uniform. The material system
   * binds it at runtime. Read-only from the shader's perspective, so writes must be flagged as
   * `InvalidAssignmentTarget`.
   */
  readonly isUniform: boolean;

  constructor(
    ident: string,
    dataType: SymbolDataType,
    isGlobalVariable: boolean,
    initAst:
      | ASTNode.Initializer
      | ASTNode.ParameterDeclarator
      | ASTNode.InitDeclaratorList
      | ASTNode.VariableDeclaration,
    isConst = false,
    isUniform = false
  ) {
    super(ident, ESymbolType.VAR, initAst, dataType);
    this.isGlobalVariable = isGlobalVariable;
    this.isConst = isConst;
    this.isUniform = isUniform;
  }
}
