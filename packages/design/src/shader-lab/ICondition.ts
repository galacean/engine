/**
 * Condition types for macro conditional evaluation.
 * Used by InstructionEncoder (build-time) and InstructionDecoder (runtime).
 * Compact field names for JSON serialization in .gsp files.
 */

/** defined(MACRO) or #ifdef MACRO */
export interface DefinedCondition {
  t: "def";
  m: string;
}

/** !defined(MACRO) or #ifndef MACRO */
export interface NotDefinedCondition {
  t: "ndef";
  m: string;
}

/** MACRO op value (e.g., SCENE_FOG_MODE > 0) */
export interface CompareCondition {
  t: "cmp";
  m: string;
  op: string;
  v: number;
}

/** Logical AND */
export interface AndCondition {
  t: "and";
  l: Condition;
  r: Condition;
}

/** Logical OR */
export interface OrCondition {
  t: "or";
  l: Condition;
  r: Condition;
}

/** Logical NOT */
export interface NotCondition {
  t: "not";
  c: Condition;
}

/**
 * Constant boolean — produced when Preprocessor-substituted numeric literals
 * appear in conditions (e.g. #define FOO 3 → #if 3 == 3 → always true).
 */
export interface BoolCondition {
  t: "bool";
  v: boolean;
}

export type Condition =
  | DefinedCondition
  | NotDefinedCondition
  | CompareCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | BoolCondition;

// ---- Preprocessor instruction types (flat bytecode for .gsp) ----

/** Opcode constants for preprocessor instructions. */
export const enum InstructionOpcode {
  /** Output text fragment */
  TEXT = 0,
  /** #ifdef: jump if macro is NOT defined */
  IF_DEF = 1,
  /** #ifndef: jump if macro IS defined */
  IF_NDEF = 2,
  /** #if MACRO op value: jump if comparison is false */
  IF_CMP = 3,
  /** #if compound expression (&&/||/!): jump if false */
  IF_EXPR = 4,
  /** #else: unconditional jump to after #endif */
  ELSE = 5,
  /** #endif: end of conditional block */
  ENDIF = 6,
  /** #define NAME (no value) */
  DEFINE = 7,
  /** #define NAME value */
  DEFINE_VAL = 8,
  /** #define NAME(params) body */
  DEFINE_FUNC = 9,
  /** #undef NAME */
  UNDEF = 10
}

/**
 * Preprocessor instruction. Compact array format for JSON serialization in .gsp files.
 *
 * Each instruction is a tuple: `[opcode, ...operands]`.
 * Operand types vary by opcode — see {@link InstructionOpcode} for the layout of each.
 */
export type Instruction = readonly (string | number | boolean | string[] | Condition)[];
