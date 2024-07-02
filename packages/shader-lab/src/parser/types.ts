import { ENonTerminal } from "./GrammarSymbol";
import { BaseToken } from "../BaseToken";
import { EKeyword, IIndexRange } from "../common";
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

export const TypeAny = 1000;

export type GalaceanDataType =
  | EKeyword.VOID
  | EKeyword.FLOAT
  | EKeyword.BOOL
  | EKeyword.INT
  | EKeyword.UINT
  | EKeyword.VEC2
  | EKeyword.VEC3
  | EKeyword.VEC4
  | EKeyword.BVEC2
  | EKeyword.BVEC3
  | EKeyword.BVEC4
  | EKeyword.IVEC2
  | EKeyword.IVEC3
  | EKeyword.IVEC4
  | EKeyword.UVEC2
  | EKeyword.UVEC3
  | EKeyword.UVEC4
  | EKeyword.MAT2
  | EKeyword.MAT3
  | EKeyword.MAT4
  | EKeyword.MAT2X3
  | EKeyword.MAT2X4
  | EKeyword.MAT3X2
  | EKeyword.MAT3X4
  | EKeyword.MAT4X2
  | EKeyword.MAT4X3
  | EKeyword.SAMPLER2D
  | EKeyword.SAMPLER3D
  | EKeyword.SAMPLER_CUBE
  | EKeyword.SAMPLER2D_SHADOW
  | EKeyword.SAMPLER_CUBE_SHADOW
  | EKeyword.SAMPLER2D_ARRAY
  | EKeyword.SAMPLER2D_ARRAY_SHADOW
  | EKeyword.I_SAMPLER2D
  | EKeyword.I_SAMPLER3D
  | EKeyword.I_SAMPLER_CUBE
  | EKeyword.I_SAMPLER2D_ARRAY
  | EKeyword.U_SAMPLER2D
  | EKeyword.U_SAMPLER3D
  | EKeyword.U_SAMPLER_CUBE
  | EKeyword.U_SAMPLER2D_ARRAY
  | typeof TypeAny
  | string;

export type IParamInfo = { ident: BaseToken; typeInfo: SymbolType; astNode: TreeNode };
