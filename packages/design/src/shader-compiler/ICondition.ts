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

/**
 * Logical conjunction of two preprocessor conditions.
 */
export interface AndCondition {
  t: "and";
  l: Condition;
  r: Condition;
}

/**
 * Logical disjunction of two preprocessor conditions.
 */
export interface OrCondition {
  t: "or";
  l: Condition;
  r: Condition;
}

/**
 * Logical negation of a preprocessor condition.
 */
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

/**
 * Signed 32-bit integer literal in a preprocessor expression.
 */
export interface NumericCondition {
  t: "num";
  v: number;
}

/**
 * Identifier whose value is supplied by the active macro set.
 */
export interface IdentifierCondition {
  t: "id";
  m: string;
}

/**
 * Arithmetic or bitwise unary expression.
 */
export interface UnaryCondition {
  t: "unary";
  op: "+" | "-" | "~";
  c: Condition;
}

/**
 * Arithmetic, bitwise, or relational binary expression.
 */
export interface BinaryCondition {
  t: "binary";
  op: "|" | "^" | "&" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "<<" | ">>" | "+" | "-" | "*" | "/" | "%";
  l: Condition;
  r: Condition;
}

/**
 * Conditional preprocessor expression (`condition ? whenTrue : whenFalse`).
 */
export interface SelectCondition {
  t: "select";
  c: Condition;
  y: Condition;
  n: Condition;
}

/**
 * Expression that must be macro-expanded before its parsed tree is final.
 */
export interface DeferredCondition {
  t: "deferred";
  e: string;
}

/**
 * Serializable preprocessor condition evaluated against the active macro set.
 */
export type Condition =
  | DefinedCondition
  | NotDefinedCondition
  | CompareCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | BoolCondition
  | NumericCondition
  | IdentifierCondition
  | UnaryCondition
  | BinaryCondition
  | SelectCondition
  | DeferredCondition;

/**
 * Preprocessor instruction tuple: `[directive, ...operands]`.
 */
export type ShaderInstruction = readonly [number, ...(string | number | string[] | Condition)[]];
