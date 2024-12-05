import { ENonTerminal } from "./GrammarSymbol";
import { BaseToken } from "../common/BaseToken";
import { GalaceanDataType, ShaderRange } from "../common";
import { ASTNode, TreeNode } from "./AST";

export type TraceStackItem = ENonTerminal | BaseToken;

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
    public mrtIndex?: number
  ) {}
}

export type NodeChild = TreeNode | BaseToken;

export type IParamInfo = { ident: BaseToken; typeInfo: SymbolType; astNode?: TreeNode };
