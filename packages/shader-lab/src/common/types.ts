import { EKeyword } from "./Keywords";

export const KeywordTable = new Map<string, EKeyword>([
  ["attribute", EKeyword.ATTRIBUTE],
  ["const", EKeyword.CONST],
  ["bool", EKeyword.BOOL],
  ["float", EKeyword.FLOAT],
  ["double", EKeyword.DOUBLE],
  ["int", EKeyword.INT],
  ["uint", EKeyword.UINT],
  ["break", EKeyword.BREAK],
  ["continue", EKeyword.CONTINUE],
  ["do", EKeyword.DO],
  ["else", EKeyword.ELSE],
  ["for", EKeyword.FOR],
  ["if", EKeyword.IF],
  ["while", EKeyword.WHILE],
  ["discard", EKeyword.DISCARD],
  ["return", EKeyword.RETURN],
  ["bvec2", EKeyword.BVEC2],
  ["bvec3", EKeyword.BVEC3],
  ["bvec4", EKeyword.BVEC4],
  ["ivec2", EKeyword.IVEC2],
  ["ivec3", EKeyword.IVEC3],
  ["ivec4", EKeyword.IVEC4],
  ["uvec2", EKeyword.UVEC2],
  ["uvec3", EKeyword.UVEC3],
  ["uvec4", EKeyword.UVEC4],
  ["vec2", EKeyword.VEC2],
  ["vec3", EKeyword.VEC3],
  ["vec4", EKeyword.VEC4],
  ["mat2", EKeyword.MAT2],
  ["mat3", EKeyword.MAT3],
  ["mat4", EKeyword.MAT4],
  ["in", EKeyword.IN],
  ["out", EKeyword.OUT],
  ["inout", EKeyword.INOUT],
  ["sampler2D", EKeyword.SAMPLER2D],
  ["samplerCube", EKeyword.SAMPLER_CUBE],
  ["sampler3D", EKeyword.SAMPLER3D],
  ["sampler2DShadow", EKeyword.SAMPLER2D_SHADOW],
  ["samplerCubeShadow", EKeyword.SAMPLER_CUBE_SHADOW],
  ["sampler2DArray", EKeyword.SAMPLER2D_ARRAY],
  ["sampler2DArrayShadow", EKeyword.SAMPLER2D_ARRAY_SHADOW],
  ["isampler2D", EKeyword.I_SAMPLER2D],
  ["isampler3D", EKeyword.I_SAMPLER3D],
  ["isamplerCube", EKeyword.I_SAMPLER_CUBE],
  ["isampler2DArray", EKeyword.I_SAMPLER2D_ARRAY],
  ["usampler2D", EKeyword.U_SAMPLER2D],
  ["usampler3D", EKeyword.U_SAMPLER3D],
  ["usamplerCube", EKeyword.U_SAMPLER_CUBE],
  ["usampler2DArray", EKeyword.U_SAMPLER2D_ARRAY],
  ["struct", EKeyword.STRUCT],
  ["void", EKeyword.VOID],
  ["true", EKeyword.TRUE],
  ["false", EKeyword.FALSE],
  ["precision", EKeyword.PRECISION],
  ["precise", EKeyword.PRECISE],
  ["highp", EKeyword.HIGHP],
  ["mediump", EKeyword.MEDIUMP],
  ["lowp", EKeyword.LOWP],
  ["invariant", EKeyword.INVARIANT],
  ["flat", EKeyword.FLAT],
  ["smooth", EKeyword.SMOOTH],
  ["noperspective", EKeyword.NOPERSPECTIVE],
  ["centroid", EKeyword.CENTROID]
]);

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
  | typeof TypeAny
  | string;

export type TokenType = ETokenType | EKeyword;
