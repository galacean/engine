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

/** Logical conjunction of two preprocessor conditions. */
export interface AndCondition {
  t: "and";
  l: Condition;
  r: Condition;
}

/** Logical disjunction of two preprocessor conditions. */
export interface OrCondition {
  t: "or";
  l: Condition;
  r: Condition;
}

/** Logical negation of a preprocessor condition. */
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

/** Preprocessor expression preserved for runtime evaluation with the active macro set. */
export interface RawCondition {
  /** Serialized condition kind. */
  t: "raw";
  /** Original preprocessor expression. */
  e: string;
}

/** Serializable preprocessor condition evaluated against the active macro set. */
export type Condition =
  | DefinedCondition
  | NotDefinedCondition
  | CompareCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | BoolCondition
  | RawCondition;

/**
 * Preprocessor instruction tuple: `[directive, ...operands]`
 */
export type ShaderInstruction = readonly [number, ...(string | number | string[] | Condition)[]];
