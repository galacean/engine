export enum EPpToken {
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

export enum EPpKeyword {
  define = 101,
  undef,
  if,
  ifdef,
  ifndef,
  else,
  elif,
  endif,
  include,

  defined
}

export const PpKeyword = new Map<string, EPpKeyword>([
  ["#define", EPpKeyword.define],
  ["#undef", EPpKeyword.undef],
  ["#if", EPpKeyword.if],
  ["#ifdef", EPpKeyword.ifdef],
  ["#ifndef", EPpKeyword.ifndef],
  ["#else", EPpKeyword.else],
  ["#elif", EPpKeyword.elif],
  ["#endif", EPpKeyword.endif],
  ["#include", EPpKeyword.include],
  ["defined", EPpKeyword.defined]
]);

export type PpConstant = boolean | number;

export const SkipTokens = ["EditorProperties", "EditorMacros", "Editor"];
