import { EKeyword } from "./Keywords";

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
  | EKeyword.VEC4_ARRAY
  | typeof TypeAny
  | string;

export type TokenType = ETokenType | EKeyword;
