import { GalaceanDataType } from "../common";
import { BaseToken } from "../common/BaseToken";
import { ASTNode, TreeNode } from "./AST";
import { NoneTerminal } from "./GrammarSymbol";

export type TraceStackItem = NoneTerminal | BaseToken;

export class SymbolType {
  constructor(
    public type: GalaceanDataType,
    public typeLexeme: string,
    public arraySpecifier?: ASTNode.ArraySpecifier
  ) {}
}

export class StructProp implements IParamInfo {
  constructor(
    public typeInfo: SymbolType,
    public ident: BaseToken,
    public mrtIndex?: number,
    public isInMacroBranch = false
  ) {}
}

export type NodeChild = TreeNode | BaseToken;

export type IParamInfo = { ident: BaseToken; typeInfo: SymbolType; astNode?: TreeNode };
