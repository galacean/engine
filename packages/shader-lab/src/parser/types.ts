import { ENonTerminal } from "./GrammarSymbol";
import { BaseToken } from "../common/BaseToken";
import { GalaceanDataType, IIndexRange } from "../common";
import { ASTNode, TreeNode } from "./AST";

export type TraceStackItem = ENonTerminal | BaseToken;

export class SymbolType {
  type: GalaceanDataType;
  arraySpecifier?: ASTNode.ArraySpecifier;
  typeLexeme: string;

  constructor(type: GalaceanDataType, typeLexeme: string, arraySpecifier?: ASTNode.ArraySpecifier) {
    this.type = type;
    this.arraySpecifier = arraySpecifier;
    this.typeLexeme = typeLexeme;
  }

  // #if _DEVELOPMENT
  toString() {
    return `${this.type}_${this.arraySpecifier?.size ?? ""}`;
  }
  // #endif
}

export class StructProp implements IParamInfo {
  typeInfo: SymbolType;
  ident: BaseToken;
  astNode: ASTNode.StructDeclarator;

  constructor(type: SymbolType, ident: BaseToken) {
    this.typeInfo = type;
    this.ident = ident;
  }
}

export type NodeChild = TreeNode | BaseToken;

export type ASTNodeConstructor = new (loc: IIndexRange, children: NodeChild[]) => TreeNode;

export type IParamInfo = { ident: BaseToken; typeInfo: SymbolType; astNode: TreeNode };
