import { ENonTerminal } from "./GrammarSymbol";
import Token from "../Token";
import { EKeyword, LocRange } from "../common";
import { ASTNode, TreeNode } from "./AST";

export type TraceStackItem = ENonTerminal | Token;

export class SymbolType {
  type: GalaceanDataType;
  arraySpecifier?: ASTNode.ArraySpecifier;
  typeLexeme: string;

  constructor(type: GalaceanDataType, typeLexeme: string, arraySpecifier?: ASTNode.ArraySpecifier) {
    this.type = type;
    this.arraySpecifier = arraySpecifier;
    this.typeLexeme = typeLexeme;
  }

  toString() {
    return `${this.type}_${this.arraySpecifier?.size ?? ""}`;
  }
}

export class StructProp implements IParamInfo {
  typeInfo: SymbolType;
  ident: Token;

  constructor(type: SymbolType, ident: Token) {
    this.typeInfo = type;
    this.ident = ident;
  }
}

export type NodeChild = TreeNode | Token;

export type ASTNodeConstructor = new (loc: LocRange, children: NodeChild[]) => TreeNode;

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
  | EKeyword.GL_RenderQueueType
  | EKeyword.GL_BlendState
  | EKeyword.GL_DepthState
  | EKeyword.GL_StencilState
  | EKeyword.GL_RasterState
  | typeof TypeAny
  | string;

export type RenderStateLabel = "BlendState" | "DepthState" | "StencilState" | "RasterState";

export type IParamInfo = { ident: Token; typeInfo: SymbolType };
