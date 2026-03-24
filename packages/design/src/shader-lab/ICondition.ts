/**
 * Condition types for macro conditional evaluation.
 * Used by ShaderInstructionEncoder (build-time) and ShaderMacroProcessor (runtime).
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

/**
 * Preprocessor instruction. Compact array format for JSON serialization in .gsp files.
 * Each instruction is a tuple: `[opcode, ...operands]`.
 */
export type ShaderInstruction = readonly (string | number | boolean | string[] | Condition)[];
