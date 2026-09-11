/**
 * Tests whether a macro is defined.
 */
export interface DefinedCondition {
  /** Serialized node discriminator. */
  t: "def";
  /** Macro name tested by `defined`. */
  m: string;
}

/**
 * Tests whether a macro is not defined.
 */
export interface NotDefinedCondition {
  /** Serialized node discriminator. */
  t: "ndef";
  /** Macro name tested by the negated definition check. */
  m: string;
}

/**
 * Compares one macro value with a signed 32-bit constant.
 */
export interface CompareCondition {
  /** Serialized node discriminator. */
  t: "cmp";
  /** Macro whose numeric value is compared. */
  m: string;
  /** Comparison operator. */
  op: "==" | "!=" | "<" | "<=" | ">" | ">=";
  /** Signed 32-bit right operand. */
  v: number;
}

/**
 * Logical conjunction of two preprocessor conditions.
 */
export interface AndCondition {
  /** Serialized node discriminator. */
  t: "and";
  /** Left operand. */
  l: Condition;
  /** Right operand. */
  r: Condition;
}

/**
 * Logical disjunction of two preprocessor conditions.
 */
export interface OrCondition {
  /** Serialized node discriminator. */
  t: "or";
  /** Left operand. */
  l: Condition;
  /** Right operand. */
  r: Condition;
}

/**
 * Logical negation of a preprocessor condition.
 */
export interface NotCondition {
  /** Serialized node discriminator. */
  t: "not";
  /** Negated operand. */
  c: Condition;
}

/**
 * Constant boolean produced when numeric literals resolve statically
 * (e.g. #define FOO 3 → #if 3 == 3 → always true).
 */
export interface BoolCondition {
  /** Serialized node discriminator. */
  t: "bool";
  /** Constant boolean value. */
  v: boolean;
}

/**
 * Signed 32-bit integer literal in a preprocessor expression.
 */
export interface NumericCondition {
  /** Serialized node discriminator. */
  t: "num";
  /** Signed 32-bit value. */
  v: number;
}

/**
 * Identifier whose value is supplied by the active macro set.
 */
export interface IdentifierCondition {
  /** Serialized node discriminator. */
  t: "id";
  /** Macro identifier resolved during variant evaluation. */
  m: string;
}

/**
 * Arithmetic or bitwise unary expression.
 */
export interface UnaryCondition {
  /** Serialized node discriminator. */
  t: "unary";
  /** Unary operator. */
  op: "+" | "-" | "~";
  /** Unary operand. */
  c: Condition;
}

/**
 * Arithmetic, bitwise, or relational binary expression.
 */
export interface BinaryCondition {
  /** Serialized node discriminator. */
  t: "binary";
  /** Binary operator. */
  op: "|" | "^" | "&" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "<<" | ">>" | "+" | "-" | "*" | "/" | "%";
  /** Left operand. */
  l: Condition;
  /** Right operand. */
  r: Condition;
}

/**
 * Expression that must be macro-expanded before its parsed tree is final.
 */
export interface DeferredCondition {
  /** Serialized node discriminator. */
  t: "deferred";
  /** Expression text retained for macro expansion. */
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
  | DeferredCondition;

/**
 * Preprocessor instruction tuple: `[directive, ...operands]`.
 */
export type ShaderInstruction = readonly [number, ...(string | number | string[] | Condition)[]];
