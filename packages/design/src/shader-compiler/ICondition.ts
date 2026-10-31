/**
 * #ifdef MACRO
 */
export interface DefinedCondition {
  t: "def";
  m: string;
}

/**
 * #ifndef MACRO
 */
export interface NotDefinedCondition {
  t: "ndef";
  m: string;
}

/**
 * #if MACRO op value (e.g., SCENE_FOG_MODE > 0)
 */
export interface CompareCondition {
  t: "cmp";
  m: string;
  op: string;
  v: number;
}

export interface AndCondition {
  t: "and";
  l: Condition;
  r: Condition;
}

export interface OrCondition {
  t: "or";
  l: Condition;
  r: Condition;
}

export interface NotCondition {
  t: "not";
  c: Condition;
}

/**
 * Constant boolean produced when numeric literals resolve statically
 * (e.g. #define FOO 3 → #if 3 == 3 → always true)
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

/**
 * Preprocessor instruction tuple: `[directive, ...operands]`
 */
export type ShaderInstruction = readonly [number, ...(string | number | string[] | Condition)[]];
