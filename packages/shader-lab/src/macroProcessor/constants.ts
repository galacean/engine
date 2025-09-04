export enum MacroParserToken {
  id,
  line_remain,
  chunk,
  int_constant,
  string_const,
  /** \>> */
  right_op,
  /** << */
  left_op,
  left_paren,
  right_paren,
  /** \>= */
  ge,
  /** <= */
  le,
  /** == */
  eq,
  /** != */
  neq,
  /** && */
  and,
  /** || */
  or,
  /** < */
  left_angle,
  /** \> */
  right_angle,
  /** \* */
  star,
  /** + */
  plus,
  /** \- */
  dash,
  /** ! */
  bang,
  /** \/ */
  slash,
  /** % */
  percent,

  EOF = 100
}

export enum MacroParserKeyword {
  define = 101,
  undef,
  if,
  ifdef,
  ifndef,
  else,
  elif,
  endif,

  defined
}

export type MacroParserConstant = boolean | number;
