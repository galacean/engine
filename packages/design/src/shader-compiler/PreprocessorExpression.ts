import type { Condition } from "./ICondition";

/**
 * Location and certainty of a preprocessor-expression parse failure.
 */
export interface PreprocessorExpressionParseError {
  /** Human-readable syntax error. */
  readonly message: string;
  /** Zero-based start offset in the expression. */
  readonly start: number;
  /** Zero-based exclusive end offset in the expression. */
  readonly end: number;
  /** Whether macro expansion cannot make the expression valid. */
  readonly certain: boolean;
}

/**
 * Successful preprocessor-expression parse.
 */
export interface ParsedPreprocessorExpression {
  readonly ok: true;
  /** Serializable expression tree. */
  readonly condition: Condition;
  /** Whether evaluation depends on macro replacement text. */
  readonly hasExpandableIdentifier: boolean;
  /** Whether a literal requires the complete 32-bit preprocessor rules rather than branch reasoning. */
  readonly requiresFullIntegerSemantics: boolean;
}

/**
 * Failed preprocessor-expression parse.
 */
export interface InvalidPreprocessorExpression {
  readonly ok: false;
  /** Structured parse failure. */
  readonly error: PreprocessorExpressionParseError;
  /** Whether a preceding identifier may expand into missing syntax. */
  readonly hasExpandableIdentifier: boolean;
  /** Whether a scanned literal requires the complete 32-bit preprocessor rules. */
  readonly requiresFullIntegerSemantics: boolean;
}

/**
 * Result of parsing a preprocessor expression.
 */
export type PreprocessorExpressionParseResult = ParsedPreprocessorExpression | InvalidPreprocessorExpression;

/** Successful syntax-only validation of a preprocessor expression. */
export interface ValidPreprocessorExpression {
  readonly ok: true;
  /** Whether evaluation depends on macro replacement text. */
  readonly hasExpandableIdentifier: boolean;
  /** Whether a literal requires the complete 32-bit preprocessor rules. */
  readonly requiresFullIntegerSemantics: boolean;
}

/** Result of validating a preprocessor expression without constructing its expression tree. */
export type PreprocessorExpressionValidationResult = ValidPreprocessorExpression | InvalidPreprocessorExpression;

/**
 * Resolves identifiers and macro-definition checks while evaluating an expression tree.
 */
export interface PreprocessorExpressionContext {
  /**
   * Resolves an identifier to a signed 32-bit integer.
   * @param name - Macro identifier.
   * @returns Resolved integer value; undefined identifiers return zero.
   */
  resolveIdentifier(name: string): number;
  /**
   * Tests whether a macro exists.
   * @param name - Macro identifier.
   * @returns Whether the identifier is defined.
   */
  isDefined(name: string): boolean;
}

type TokenKind = "identifier" | "number" | "operator" | "end" | "invalid";

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

const binaryPrecedence: Readonly<Record<string, number>> = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  "<=": 7,
  ">": 7,
  ">=": 7,
  "<<": 8,
  ">>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10
};

/**
 * Parses the complete integer-expression grammar used by `#if` and `#elif`.
 * @param expression - Text after the preprocessor directive.
 * @returns A serializable tree or a structured parse failure.
 */
export function parsePreprocessorExpression(expression: string): PreprocessorExpressionParseResult {
  return new ExpressionParser(expression, true).parse();
}

/**
 * Validates the complete `#if` and `#elif` grammar without allocating a condition tree.
 * @param expression - Text after the preprocessor directive.
 * @returns Syntax validity, failure offsets, and macro-expansion certainty.
 */
export function validatePreprocessorExpression(expression: string): PreprocessorExpressionValidationResult {
  return new ExpressionParser(expression, false).validate();
}

/**
 * Evaluates an expression whose result is independent of macro state.
 * @param expression - Complete preprocessor expression text.
 * @returns Signed 32-bit result, or `undefined` when the expression is invalid, state-dependent, or unevaluable.
 */
export function evaluateContextFreePreprocessorExpression(expression: string): number | undefined {
  const parsed = parsePreprocessorExpression(expression);
  return parsed.ok ? evaluateContextFreePreprocessorCondition(parsed.condition) : undefined;
}

/**
 * Evaluates a parsed condition whose result is independent of macro state.
 * @param condition - Parsed preprocessor expression tree.
 * @returns Signed 32-bit result, or `undefined` when macro state or an invalid operation affects the result.
 */
export function evaluateContextFreePreprocessorCondition(condition: Condition): number | undefined {
  if (!isContextFreeExpression(condition)) return undefined;
  const evaluated = evaluatePreprocessorExpressionInternal(condition, EMPTY_EXPRESSION_CONTEXT);
  return typeof evaluated === "number" ? evaluated : undefined;
}

/**
 * Evaluates a parsed preprocessor expression with C-style signed 32-bit arithmetic.
 * @param condition - Serializable expression tree.
 * @param context - Active macro value and definition resolver.
 * @returns Signed 32-bit result; nonzero values are true.
 * @throws Error when an active expression divides by zero or contains a deferred node.
 */
export function evaluatePreprocessorExpression(condition: Condition, context: PreprocessorExpressionContext): number {
  const evaluated = evaluatePreprocessorExpressionInternal(condition, context);
  if (typeof evaluated === "string") throw new Error(evaluated);
  return evaluated;
}

type PreprocessorExpressionEvaluation = number | PreprocessorExpressionEvaluationError;
type PreprocessorExpressionEvaluationError =
  | "Division by zero in active preprocessor expression."
  | "Modulo by zero in active preprocessor expression."
  | "Deferred preprocessor expressions must be expanded before evaluation.";

const EMPTY_EXPRESSION_CONTEXT: PreprocessorExpressionContext = Object.freeze({
  resolveIdentifier: () => 0,
  isDefined: () => false
});

function evaluatePreprocessorExpressionInternal(
  condition: Condition,
  context: PreprocessorExpressionContext
): PreprocessorExpressionEvaluation {
  switch (condition.t) {
    case "def":
      return context.isDefined(condition.m) ? 1 : 0;
    case "ndef":
      return context.isDefined(condition.m) ? 0 : 1;
    case "cmp":
      return evaluateBinaryExpression(context.resolveIdentifier(condition.m), condition.op, condition.v);
    case "and": {
      const left = evaluatePreprocessorExpressionInternal(condition.l, context);
      if (typeof left === "string" || left === 0) return left;
      const right = evaluatePreprocessorExpressionInternal(condition.r, context);
      return typeof right === "string" ? right : right !== 0 ? 1 : 0;
    }
    case "or": {
      const left = evaluatePreprocessorExpressionInternal(condition.l, context);
      if (typeof left === "string") return left;
      if (left !== 0) return 1;
      const right = evaluatePreprocessorExpressionInternal(condition.r, context);
      return typeof right === "string" ? right : right !== 0 ? 1 : 0;
    }
    case "not": {
      const value = evaluatePreprocessorExpressionInternal(condition.c, context);
      return typeof value === "string" ? value : value === 0 ? 1 : 0;
    }
    case "bool":
      return condition.v ? 1 : 0;
    case "num":
      return condition.v;
    case "id":
      return context.resolveIdentifier(condition.m);
    case "unary": {
      const value = evaluatePreprocessorExpressionInternal(condition.c, context);
      if (typeof value === "string") return value;
      switch (condition.op) {
        case "+":
          return value | 0;
        case "-":
          return -value | 0;
        case "~":
          return ~value;
      }
    }
    case "binary": {
      const left = evaluatePreprocessorExpressionInternal(condition.l, context);
      if (typeof left === "string") return left;
      const right = evaluatePreprocessorExpressionInternal(condition.r, context);
      return typeof right === "string" ? right : evaluateBinaryExpression(left, condition.op, right);
    }
    case "select": {
      const selector = evaluatePreprocessorExpressionInternal(condition.c, context);
      if (typeof selector === "string") return selector;
      return evaluatePreprocessorExpressionInternal(selector !== 0 ? condition.y : condition.n, context);
    }
    case "deferred":
      return "Deferred preprocessor expressions must be expanded before evaluation.";
  }
}

class ExpressionParser {
  private readonly _tokens: Token[];
  private _index = 0;
  private _failure?: PreprocessorExpressionParseError;
  private _sawExpandableIdentifier = false;
  private _rightEdgeExpandable = false;
  private _requiresFullIntegerSemantics = false;

  constructor(
    expression: string,
    private readonly _buildCondition: boolean
  ) {
    this._tokens = tokenize(expression);
  }

  parse(): PreprocessorExpressionParseResult {
    const condition = this._parseRoot();
    const invalid = this._invalidResult();
    if (invalid) return invalid;
    return {
      ok: true,
      condition: condition!,
      hasExpandableIdentifier: this._sawExpandableIdentifier,
      requiresFullIntegerSemantics: this._requiresFullIntegerSemantics
    };
  }

  validate(): PreprocessorExpressionValidationResult {
    this._parseRoot();
    const invalid = this._invalidResult();
    if (invalid) return invalid;
    return {
      ok: true,
      hasExpandableIdentifier: this._sawExpandableIdentifier,
      requiresFullIntegerSemantics: this._requiresFullIntegerSemantics
    };
  }

  private _parseRoot(): Condition | undefined {
    const condition = this._parseConditional();
    if (!this._failure) {
      const token = this._current();
      if (token.kind !== "end") {
        const unexpectedExpandableIdentifier = token.kind === "identifier" && token.text !== "defined";
        this._sawExpandableIdentifier ||= unexpectedExpandableIdentifier;
        const certain = !this._rightEdgeExpandable && !unexpectedExpandableIdentifier;
        this._fail(`Unexpected token '${token.text}' in preprocessor expression.`, token, certain);
      }
    }
    return condition;
  }

  private _invalidResult(): InvalidPreprocessorExpression | undefined {
    return this._failure
      ? {
          ok: false,
          error: this._failure,
          hasExpandableIdentifier: this._sawExpandableIdentifier,
          requiresFullIntegerSemantics: this._requiresFullIntegerSemantics
        }
      : undefined;
  }

  private _parseConditional(): Condition | undefined {
    const condition = this._parseBinary(1);
    if (this._failure || !condition || !this._consume("?")) return condition;
    const whenTrue = this._parseConditional();
    if (this._failure || !whenTrue) return undefined;
    if (!this._consume(":")) {
      this._fail("Expected ':' in conditional preprocessor expression.", this._current(), true);
      return undefined;
    }
    const whenFalse = this._parseConditional();
    if (!whenFalse) return undefined;
    return this._buildCondition ? { t: "select", c: condition, y: whenTrue, n: whenFalse } : VALID_CONDITION;
  }

  private _parseBinary(minPrecedence: number): Condition | undefined {
    let left = this._parseUnary();
    if (this._failure || !left) return undefined;
    while (true) {
      const token = this._current();
      const precedence = binaryPrecedence[token.text];
      if (precedence === undefined || precedence < minPrecedence) return left;
      this._index++;
      const right = this._parseBinary(precedence + 1);
      if (this._failure || !right) return undefined;
      if (this._buildCondition) {
        if (token.text === "&&") left = { t: "and", l: left, r: right };
        else if (token.text === "||") left = { t: "or", l: left, r: right };
        else
          left = {
            t: "binary",
            op: token.text as Extract<Condition, { t: "binary" }>["op"],
            l: left,
            r: right
          };
      }
    }
  }

  private _parseUnary(): Condition | undefined {
    const token = this._current();
    if (
      token.kind === "operator" &&
      (token.text === "+" || token.text === "-" || token.text === "!" || token.text === "~")
    ) {
      this._index++;
      const condition = this._parseUnary();
      if (!condition) return undefined;
      if (!this._buildCondition) return VALID_CONDITION;
      return token.text === "!"
        ? { t: "not", c: condition }
        : { t: "unary", op: token.text as "+" | "-" | "~", c: condition };
    }
    return this._parsePrimary();
  }

  private _parsePrimary(): Condition | undefined {
    const token = this._current();
    if (token.kind === "number") {
      this._index++;
      this._rightEdgeExpandable = false;
      this._requiresFullIntegerSemantics ||= requiresFullIntegerSemantics(token.text);
      const value = parseIntegerLiteral(token.text);
      if (value === undefined) {
        this._fail("Integer literal exceeds 32 bits in preprocessor expression.", token, true);
        return undefined;
      }
      return this._buildCondition ? { t: "num", v: value } : VALID_CONDITION;
    }
    if (token.kind === "identifier") {
      if (token.text === "defined") return this._parseDefined();
      this._sawExpandableIdentifier = true;
      this._rightEdgeExpandable = true;
      this._index++;
      return this._buildCondition ? { t: "id", m: token.text } : VALID_CONDITION;
    }
    if (this._consume("(")) {
      const condition = this._parseConditional();
      if (!this._failure && !this._consume(")")) {
        this._fail("Expected ')' in preprocessor expression.", this._current(), false);
      }
      if (!this._failure) this._rightEdgeExpandable = false;
      return condition;
    }
    if (token.kind === "end") {
      this._fail("Expected an operand before the end of the preprocessor expression.", token, true);
    } else {
      this._fail(`Expected an operand, found '${token.text}'.`, token, true);
    }
    return undefined;
  }

  private _parseDefined(): Condition | undefined {
    this._index++;
    this._rightEdgeExpandable = false;
    const parenthesized = this._consume("(");
    const name = this._current();
    if (name.kind !== "identifier" || name.text === "defined") {
      this._fail("Expected a macro name after 'defined'.", name, true);
      return undefined;
    }
    this._index++;
    if (parenthesized && !this._consume(")")) {
      this._fail("Expected ')' after the macro name in 'defined(...)'.", this._current(), true);
      return undefined;
    }
    return this._buildCondition ? { t: "def", m: name.text } : VALID_CONDITION;
  }

  private _consume(text: string): boolean {
    if (this._current().text !== text) return false;
    this._index++;
    return true;
  }

  private _current(): Token {
    return this._tokens[this._index];
  }

  private _fail(message: string, token: Token, certain: boolean): void {
    this._failure ??= {
      message,
      start: token.start,
      end: Math.max(token.end, token.start + 1),
      certain
    };
  }
}

const VALID_CONDITION: Condition = Object.freeze({ t: "bool", v: true });

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const charCode = expression.charCodeAt(index);
    if (isWhitespace(charCode)) {
      index++;
      continue;
    }
    if (charCode === 47 && expression.charCodeAt(index + 1) === 47) break;
    if (charCode === 47 && expression.charCodeAt(index + 1) === 42) {
      const end = expression.indexOf("*/", index + 2);
      if (end < 0) {
        tokens.push({ kind: "invalid", text: expression.slice(index), start: index, end: expression.length });
        index = expression.length;
      } else {
        index = end + 2;
      }
      continue;
    }
    if (isIdentifierStart(charCode)) {
      const start = index++;
      while (index < expression.length && isIdentifierPart(expression.charCodeAt(index))) index++;
      tokens.push({ kind: "identifier", text: expression.slice(start, index), start, end: index });
      continue;
    }
    if (charCode >= 48 && charCode <= 57) {
      const start = index;
      if (charCode === 48 && (expression.charCodeAt(index + 1) === 88 || expression.charCodeAt(index + 1) === 120)) {
        index += 2;
        const digitStart = index;
        while (index < expression.length && isHexDigit(expression.charCodeAt(index))) index++;
        if (index === digitStart) {
          tokens.push({ kind: "invalid", text: expression.slice(start, index), start, end: index });
          continue;
        }
      } else if (charCode === 48) {
        index++;
        while (index < expression.length && expression.charCodeAt(index) >= 48 && expression.charCodeAt(index) <= 55)
          index++;
      } else {
        index++;
        while (index < expression.length && expression.charCodeAt(index) >= 48 && expression.charCodeAt(index) <= 57)
          index++;
      }
      const suffixStart = index;
      while (isIntegerSuffix(expression.charCodeAt(index))) index++;
      const suffix = expression.slice(suffixStart, index);
      if (!isValidIntegerSuffix(suffix) || isIdentifierStart(expression.charCodeAt(index))) {
        while (isIdentifierPart(expression.charCodeAt(index))) index++;
        tokens.push({ kind: "invalid", text: expression.slice(start, index), start, end: index });
        continue;
      }
      tokens.push({ kind: "number", text: expression.slice(start, index), start, end: index });
      continue;
    }
    const nextCharCode = expression.charCodeAt(index + 1);
    if (isDoubleOperator(charCode, nextCharCode)) {
      tokens.push({ kind: "operator", text: expression.slice(index, index + 2), start: index, end: index + 2 });
      index += 2;
      continue;
    }
    if (isSingleOperator(charCode)) {
      tokens.push({ kind: "operator", text: expression[index], start: index, end: index + 1 });
      index++;
      continue;
    }
    tokens.push({ kind: "invalid", text: expression[index], start: index, end: index + 1 });
    index++;
  }
  tokens.push({ kind: "end", text: "", start: index, end: index });
  return tokens;
}

function parseIntegerLiteral(literal: string): number | undefined {
  let end = literal.length;
  while (end > 0 && isIntegerSuffix(literal.charCodeAt(end - 1))) end--;
  let value: number;
  if (literal.charCodeAt(0) === 48) {
    const prefix = literal.charCodeAt(1);
    if (prefix === 88 || prefix === 120) value = parseInt(literal.slice(2, end), 16);
    else if (end > 1) value = parseInt(literal.slice(0, end), 8);
    else value = 0;
  } else {
    value = Number(literal.slice(0, end));
  }
  return value <= 0xffffffff ? value | 0 : undefined;
}

function requiresFullIntegerSemantics(literal: string): boolean {
  let end = literal.length;
  while (end > 0 && isIntegerSuffix(literal.charCodeAt(end - 1))) end--;
  if (end !== literal.length) return true;
  const value =
    literal.startsWith("0x") || literal.startsWith("0X")
      ? parseInt(literal.slice(2, end), 16)
      : literal.length > 1 && literal.charCodeAt(0) === 48
        ? parseInt(literal.slice(0, end), 8)
        : Number(literal.slice(0, end));
  return value > 0x7fffffff;
}

function evaluateBinaryExpression(left: number, operator: string, right: number): PreprocessorExpressionEvaluation {
  switch (operator) {
    case "||":
      return left !== 0 || right !== 0 ? 1 : 0;
    case "&&":
      return left !== 0 && right !== 0 ? 1 : 0;
    case "|":
      return left | right;
    case "^":
      return left ^ right;
    case "&":
      return left & right;
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "<<":
      return left << right;
    case ">>":
      return left >> right;
    case "+":
      return (left + right) | 0;
    case "-":
      return (left - right) | 0;
    case "*":
      return Math.imul(left, right);
    case "/":
      if (right === 0) return "Division by zero in active preprocessor expression.";
      return Math.trunc(left / right) | 0;
    case "%":
      if (right === 0) return "Modulo by zero in active preprocessor expression.";
      return left % right | 0;
    default:
      throw new Error(`Unsupported preprocessor operator '${operator}'.`);
  }
}

function isContextFreeExpression(condition: Condition): boolean {
  switch (condition.t) {
    case "and":
    case "or":
    case "binary":
      return isContextFreeExpression(condition.l) && isContextFreeExpression(condition.r);
    case "not":
    case "unary":
      return isContextFreeExpression(condition.c);
    case "select":
      return (
        isContextFreeExpression(condition.c) &&
        isContextFreeExpression(condition.y) &&
        isContextFreeExpression(condition.n)
      );
    case "bool":
    case "num":
      return true;
    case "def":
    case "ndef":
    case "cmp":
    case "id":
    case "deferred":
      return false;
  }
}

function isWhitespace(charCode: number): boolean {
  return charCode === 32 || (charCode >= 9 && charCode <= 13);
}

function isIdentifierStart(charCode: number): boolean {
  return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || charCode === 95;
}

function isIdentifierPart(charCode: number): boolean {
  return isIdentifierStart(charCode) || (charCode >= 48 && charCode <= 57);
}

function isHexDigit(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) || (charCode >= 65 && charCode <= 70) || (charCode >= 97 && charCode <= 102)
  );
}

function isIntegerSuffix(charCode: number): boolean {
  return charCode === 76 || charCode === 85 || charCode === 108 || charCode === 117;
}

function isValidIntegerSuffix(suffix: string): boolean {
  return /^(?:u(?:ll?)?|ll?u?)?$/i.test(suffix);
}

function isDoubleOperator(charCode: number, nextCharCode: number): boolean {
  return (
    (charCode === 124 && nextCharCode === 124) ||
    (charCode === 38 && nextCharCode === 38) ||
    ((charCode === 33 || charCode === 61) && nextCharCode === 61) ||
    ((charCode === 60 || charCode === 62) && (nextCharCode === 61 || nextCharCode === charCode))
  );
}

function isSingleOperator(charCode: number): boolean {
  return (
    charCode === 33 ||
    charCode === 37 ||
    charCode === 38 ||
    charCode === 40 ||
    charCode === 41 ||
    charCode === 42 ||
    charCode === 43 ||
    charCode === 45 ||
    charCode === 47 ||
    charCode === 58 ||
    charCode === 60 ||
    charCode === 62 ||
    charCode === 63 ||
    charCode === 94 ||
    charCode === 124 ||
    charCode === 126
  );
}
