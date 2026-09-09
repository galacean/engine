import { BaseToken } from "../common/BaseToken";
import { ASTNode, TreeNode } from "./AST";
import { NoneTerminal } from "./GrammarSymbol";
import { SymbolDataType } from "./symbolTable/SymbolDataType";
import type { BranchSignature } from "../common/BaseToken";
import type { FnSymbol } from "./symbolTable/FnSymbol";

/** Effective syntax of a macro invocation under one proven source-macro configuration. @internal */
export interface MacroExpansionSyntax {
  /** Some expansion or binding could not be proven; its execution effects remain unknown. */
  readonly hasUnknownEffects?: boolean;
  readonly branch: BranchSignature;
  readonly arguments: readonly TreeNode[];
  readonly references: readonly { name: string; call: boolean; functions: readonly FnSymbol[] }[];
  readonly keywords: readonly number[];
}

export type TraceStackItem = NoneTerminal | BaseToken;

export class SymbolType extends SymbolDataType {}

export class StructProp implements IParamInfo {
  constructor(
    public typeInfo: SymbolType,
    public ident: BaseToken,
    public mrtIndex?: number,
    public isInMacroBranch = false,
    /** Whether the member carries the `flat` interpolation qualifier — integer varyings require it. */
    public isFlat = false
  ) {}
}

export type NodeChild = TreeNode | BaseToken;

export type IParamInfo = {
  ident?: BaseToken;
  typeInfo?: SymbolType;
  astNode?: ASTNode.ParameterDeclaration | ASTNode.MacroParamBlock;
};
