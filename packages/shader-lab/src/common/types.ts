import { Keyword } from "./enums/Keyword";


export enum ETokenType {
  ID = 1000,
  FLOAT_CONSTANT,
  INT_CONSTANT,
  STRING_CONST,
  /** << */
  LEFT_OP,
  /** \>> */
  RIGHT_OP,
  /** ++ */
  INC_OP,
  /** -- */
  DEC_OP,
  /** <= */
  LE_OP,
  /** \>= */
  GE_OP,
  /** == */
  EQ_OP,
  /** != */
  NE_OP,
  /** && */
  AND_OP,
  /** || */
  OR_OP,
  /** ^^ */
  XOR_OP,
  /** *= */
  MUL_ASSIGN,
  /** /= */
  DIV_ASSIGN,
  /** += */
  ADD_ASSIGN,
  /** -= */
  SUB_ASSIGN,
  /** %= */
  MOD_ASSIGN,
  /** <<= */
  LEFT_ASSIGN,
  /** >>= */
  RIGHT_ASSIGN,
  /** &= */
  AND_ASSIGN,
  /** ^= */
  XOR_ASSIGN,
  /** |= */
  OR_ASSIGN,
  /** ( */
  LEFT_PAREN,
  /** ) */
  RIGHT_PAREN,
  /** [ */
  LEFT_BRACKET,
  /** ] */
  RIGHT_BRACKET,
  /** { */
  LEFT_BRACE,
  /** } */
  RIGHT_BRACE,
  /** . */
  DOT,
  /** , */
  COMMA,
  COLON,
  /** = */
  EQUAL,
  /** ; */
  SEMICOLON,
  /** ! */
  BANG,
  /** \- */
  DASH,
  /** ~ */
  TILDE,
  PLUS,
  /** \* */
  STAR,
  /** / */
  SLASH,
  /** % */
  PERCENT,
  /** < */
  LEFT_ANGLE,
  /** \> */
  RIGHT_ANGLE,
  VERTICAL_BAR,
  /** ^ */
  CARET,
  /** & */
  AMPERSAND,
  /** ? */
  QUESTION,

  NOT_WORD,

  /** ε */
  EPSILON = 1998,
  EOF = 1999
}

export const TypeAny = 3000;

export type GalaceanDataType =
  | Keyword.VOID
  | Keyword.FLOAT
  | Keyword.BOOL
  | Keyword.INT
  | Keyword.UINT
  | Keyword.VEC2
  | Keyword.VEC3
  | Keyword.VEC4
  | Keyword.BVEC2
  | Keyword.BVEC3
  | Keyword.BVEC4
  | Keyword.IVEC2
  | Keyword.IVEC3
  | Keyword.IVEC4
  | Keyword.UVEC2
  | Keyword.UVEC3
  | Keyword.UVEC4
  | Keyword.MAT2
  | Keyword.MAT3
  | Keyword.MAT4
  | Keyword.MAT2X3
  | Keyword.MAT2X4
  | Keyword.MAT3X2
  | Keyword.MAT3X4
  | Keyword.MAT4X2
  | Keyword.MAT4X3
  | Keyword.SAMPLER2D
  | Keyword.SAMPLER3D
  | Keyword.SAMPLER_CUBE
  | Keyword.SAMPLER2D_SHADOW
  | Keyword.SAMPLER_CUBE_SHADOW
  | Keyword.SAMPLER2D_ARRAY
  | Keyword.SAMPLER2D_ARRAY_SHADOW
  | Keyword.I_SAMPLER2D
  | Keyword.I_SAMPLER3D
  | Keyword.I_SAMPLER_CUBE
  | Keyword.I_SAMPLER2D_ARRAY
  | Keyword.U_SAMPLER2D
  | Keyword.U_SAMPLER3D
  | Keyword.U_SAMPLER_CUBE
  | Keyword.U_SAMPLER2D_ARRAY
  | Keyword.VEC4_ARRAY
  | typeof TypeAny
  | string;

export type TokenType = ETokenType | Keyword;
