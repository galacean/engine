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
  /** Definite evaluation failure that is independent of macro state. */
  readonly evaluationError?: string;
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
}

/**
 * Result of parsing a preprocessor expression.
 */
export type PreprocessorExpressionParseResult = ParsedPreprocessorExpression | InvalidPreprocessorExpression;

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

/**
 * Resolves the subset of macro state known during source preprocessing.
 *
 * `undefined` means that the caller must preserve both possibilities. This keeps include
 * reachability conservative when a macro may be supplied by the runtime configuration.
 */
export interface PartiallyKnownPreprocessorExpressionContext {
  /**
   * Resolves an identifier against known source macro state.
   * @param name - Macro identifier.
   * @returns Known value, definite error, or an empty result when the value depends on external macro state.
   */
  resolveIdentifier(name: string): PartiallyKnownPreprocessorExpressionResult;
  /**
   * Resolves whether a macro is defined.
   * @param name - Macro identifier.
   * @returns Known definition state, or `undefined` when supplied externally.
   */
  isDefined(name: string): boolean | undefined;
}

/**
 * Result of evaluating an expression against incomplete macro state.
 */
export interface PartiallyKnownPreprocessorExpressionResult {
  /** Known signed 32-bit value, absent when external macro state still matters. */
  readonly value?: number;
  /** Definite failure reached without assuming an external macro value. */
  readonly error?: string;
}

/**
 * One object-like or function-like macro used by preprocessor-expression expansion.
 */
export interface PreprocessorExpressionMacro {
  /** Replacement-list source before parameter substitution. */
  readonly body: string;
  /** Function parameters; absent for an object-like macro. */
  readonly parameters?: readonly string[];
}

/**
 * Result of token-aware preprocessor-expression macro expansion.
 */
export interface PreprocessorExpressionExpansionResult {
  /** Comment-free, token-normalized expanded expression. */
  readonly expression: string;
  /** Deterministic expansion failure. */
  readonly error?: string;
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
const MAX_EXPRESSION_NESTING = 256;
const MAX_MACRO_EXPANSION_DEPTH = 256;

/**
 * Parses the complete integer-expression grammar used by `#if` and `#elif`.
 * @param expression - Text after the preprocessor directive.
 * @returns A serializable tree or a structured parse failure.
 */
export function parsePreprocessorExpression(expression: string): PreprocessorExpressionParseResult {
  return new ExpressionParser(expression).parse();
}

/**
 * Resolves `defined` operators and removes comments with the expression parser's tokenization rules.
 * @param expression - Expression before ordinary macro replacement.
 * @param isDefined - Resolves whether one macro name is defined, or returns `undefined` when external state decides.
 * @returns Token-normalized expression with every known `defined` operator replaced by `0` or `1`.
 */
export function resolvePreprocessorDefinedOperators(
  expression: string,
  isDefined: (name: string) => boolean | undefined
): string {
  const tokens = tokenize(expression);
  const parts: string[] = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index];
    if (token.kind !== "identifier" || token.text !== "defined") {
      parts.push(token.text);
      continue;
    }

    const next = tokens[index + 1];
    const parenthesized = next?.text === "(";
    const name = tokens[index + (parenthesized ? 2 : 1)];
    const close = parenthesized ? tokens[index + 3] : name;
    if (name?.kind !== "identifier" || name.text === "defined" || (parenthesized && close?.text !== ")")) {
      parts.push(token.text);
      continue;
    }

    const defined = isDefined(name.text);
    if (defined === undefined) {
      parts.push("defined");
      if (parenthesized) parts.push("(");
      parts.push(name.text);
      if (parenthesized) parts.push(")");
    } else {
      parts.push(defined ? "1" : "0");
    }
    index += parenthesized ? 3 : 1;
  }
  return parts.join(" ");
}

/**
 * Expands object-like and function-like macros with the expression parser's tokenization rules.
 * @param expression - Expression after any caller-owned `defined` resolution.
 * @param resolveMacro - Resolves source or runtime macro definitions by name.
 * @returns Token-normalized expansion or a deterministic depth error.
 */
export function expandPreprocessorExpressionMacros(
  expression: string,
  resolveMacro: (name: string) => PreprocessorExpressionMacro | undefined
): PreprocessorExpressionExpansionResult {
  return expandExpressionTokens(expression, resolveMacro, new Set(), 0);
}

function expandExpressionTokens(
  expression: string,
  resolveMacro: (name: string) => PreprocessorExpressionMacro | undefined,
  expanding: Set<string>,
  depth: number
): PreprocessorExpressionExpansionResult {
  if (depth > MAX_MACRO_EXPANSION_DEPTH) {
    return {
      expression: "",
      error: `Preprocessor macro expansion exceeds ${MAX_MACRO_EXPANSION_DEPTH} nested replacements.`
    };
  }

  const tokens = tokenize(expression);
  const parts: string[] = [];
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index];
    if (token.kind !== "identifier" || expanding.has(token.text)) {
      parts.push(token.text);
      continue;
    }

    if (token.text === "defined") {
      parts.push(token.text);
      const next = tokens[index + 1];
      if (next?.text === "(") {
        parts.push(next.text);
        if (tokens[index + 2]) parts.push(tokens[index + 2].text);
        if (tokens[index + 3]?.text === ")") parts.push(")");
        index += tokens[index + 3]?.text === ")" ? 3 : 2;
      } else if (next) {
        parts.push(next.text);
        index++;
      }
      continue;
    }

    const macro = resolveMacro(token.text);
    if (!macro) {
      parts.push(token.text);
      continue;
    }

    let body = macro.body;
    let invocationEnd = index;
    if (macro.parameters) {
      if (tokens[index + 1]?.text !== "(") {
        parts.push(token.text);
        continue;
      }
      const invocation = parseMacroInvocation(tokens, index + 1);
      if (!invocation || invocation.arguments.length !== macro.parameters.length) {
        parts.push(token.text);
        continue;
      }
      body = substituteMacroParameters(body, macro.parameters, invocation.arguments);
      invocationEnd = invocation.end;
    }

    expanding.add(token.text);
    const expanded = expandExpressionTokens(body, resolveMacro, expanding, depth + 1);
    expanding.delete(token.text);
    if (expanded.error) return expanded;
    if (expanded.expression) parts.push(expanded.expression);
    index = invocationEnd;
  }
  return { expression: parts.join(" ") };
}

function parseMacroInvocation(
  tokens: readonly Token[],
  openParen: number
): { readonly arguments: readonly string[]; readonly end: number } | undefined {
  const args: string[][] = [[]];
  let depth = 1;
  for (let index = openParen + 1; index < tokens.length - 1; index++) {
    const token = tokens[index];
    if (token.text === "(") {
      depth++;
      args[args.length - 1].push(token.text);
    } else if (token.text === ")") {
      if (--depth === 0) {
        const normalized = args.length === 1 && args[0].length === 0 ? [] : args.map((arg) => arg.join(" "));
        return { arguments: normalized, end: index };
      }
      args[args.length - 1].push(token.text);
    } else if (token.text === "," && depth === 1) {
      args.push([]);
    } else {
      args[args.length - 1].push(token.text);
    }
  }
}

function substituteMacroParameters(body: string, parameters: readonly string[], arguments_: readonly string[]): string {
  const replacements = new Map<string, string>();
  for (let index = 0; index < parameters.length; index++) replacements.set(parameters[index], arguments_[index]);
  const parts: string[] = [];
  for (const token of tokenize(body).slice(0, -1)) {
    parts.push(token.kind === "identifier" ? (replacements.get(token.text) ?? token.text) : token.text);
  }
  return parts.join(" ");
}

/**
 * Evaluates an expression whose result is independent of macro state.
 * @param expression - Complete preprocessor expression text.
 * @returns 32-bit result, or `undefined` when the expression is invalid, state-dependent, or unevaluable.
 */
export function evaluateContextFreePreprocessorExpression(expression: string): number | undefined {
  const parsed = parsePreprocessorExpression(expression);
  return parsed.ok ? evaluateContextFreePreprocessorCondition(parsed.condition) : undefined;
}

/**
 * Evaluates a parsed condition whose result is independent of macro state.
 * @param condition - Parsed preprocessor expression tree.
 * @returns 32-bit result, or `undefined` when macro state or an invalid operation affects the result.
 */
export function evaluateContextFreePreprocessorCondition(condition: Condition): number | undefined {
  const evaluated = evaluateStaticallyKnownPreprocessorCondition(condition);
  return typeof evaluated === "number" ? evaluated : undefined;
}

/**
 * Evaluates the part of a preprocessor expression determined by known source macro state.
 * @param condition - Parsed preprocessor expression tree.
 * @param context - Partially known macro values and definition states.
 * @returns 32-bit result, or `undefined` when any reachable input remains unknown.
 */
export function evaluatePartiallyKnownPreprocessorCondition(
  condition: Condition,
  context: PartiallyKnownPreprocessorExpressionContext
): number | undefined {
  return evaluatePartiallyKnownPreprocessorConditionResult(condition, context).value;
}

/**
 * Evaluates the known portion of an expression while preserving definite evaluation failures.
 * @param condition - Parsed preprocessor expression tree.
 * @param context - Partially known macro values and definition states.
 * @returns Known value, definite error, or an empty result when external state still matters.
 */
export function evaluatePartiallyKnownPreprocessorConditionResult(
  condition: Condition,
  context: PartiallyKnownPreprocessorExpressionContext
): PartiallyKnownPreprocessorExpressionResult {
  const evaluated = evaluateStaticallyKnownPreprocessorCondition(condition, context);
  return typeof evaluated === "number"
    ? { value: evaluated }
    : typeof evaluated === "string"
      ? { error: evaluated }
      : {};
}

/**
 * Evaluates a parsed preprocessor expression with signed 32-bit arithmetic matching ANGLE's preprocessor.
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
  | "Shift count must be between 0 and 31 in active preprocessor expression."
  | "Deferred preprocessor expressions must be expanded before evaluation.";

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
      return condition.op === "+" ? value | 0 : condition.op === "-" ? -value | 0 : ~value;
    }
    case "binary": {
      const left = evaluatePreprocessorExpressionInternal(condition.l, context);
      if (typeof left === "string") return left;
      const right = evaluatePreprocessorExpressionInternal(condition.r, context);
      return typeof right === "string" ? right : evaluateBinaryExpression(left, condition.op, right);
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
  private _nestingDepth = 0;

  constructor(expression: string) {
    this._tokens = tokenize(expression);
  }

  parse(): PreprocessorExpressionParseResult {
    const condition = this._parseRoot();
    const invalid = this._invalidResult();
    if (invalid) return invalid;
    const evaluated = evaluateStaticallyKnownPreprocessorCondition(condition!);
    return {
      ok: true,
      condition: condition!,
      hasExpandableIdentifier: this._sawExpandableIdentifier,
      ...(typeof evaluated === "string" ? { evaluationError: evaluated } : undefined)
    };
  }

  private _parseRoot(): Condition | undefined {
    const condition = this._parseBinary(1);
    if (!this._failure) {
      const token = this._current();
      if (token.kind !== "end") {
        const unexpectedExpandableIdentifier = token.kind === "identifier" && token.text !== "defined";
        this._sawExpandableIdentifier ||= unexpectedExpandableIdentifier;
        const unsupportedConditionalOperator = token.text === "?" || token.text === ":";
        const certain =
          unsupportedConditionalOperator || (!this._rightEdgeExpandable && !unexpectedExpandableIdentifier);
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
          hasExpandableIdentifier: this._sawExpandableIdentifier
        }
      : undefined;
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

  private _parseUnary(): Condition | undefined {
    const token = this._current();
    if (
      token.kind === "operator" &&
      (token.text === "+" || token.text === "-" || token.text === "!" || token.text === "~")
    ) {
      if (!this._enterNesting(token)) return;
      this._index++;
      const condition = this._parseUnary();
      this._nestingDepth--;
      if (!condition) return undefined;
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
      const value = parseIntegerLiteral(token.text);
      if (value === undefined) {
        this._fail("Integer literal exceeds 32 bits in preprocessor expression.", token, true);
        return undefined;
      }
      return { t: "num", v: value };
    }
    if (token.kind === "identifier") {
      if (token.text === "defined") return this._parseDefined();
      this._sawExpandableIdentifier = true;
      this._rightEdgeExpandable = true;
      this._index++;
      return { t: "id", m: token.text };
    }
    if (this._consume("(")) {
      if (!this._enterNesting(token)) return;
      const condition = this._parseBinary(1);
      if (!this._failure && !this._consume(")")) {
        this._fail("Expected ')' in preprocessor expression.", this._current(), false);
      }
      if (!this._failure) this._rightEdgeExpandable = false;
      this._nestingDepth--;
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
    return { t: "def", m: name.text };
  }

  private _consume(text: string): boolean {
    if (this._current().text !== text) return false;
    this._index++;
    return true;
  }

  private _enterNesting(token: Token): boolean {
    if (this._nestingDepth >= MAX_EXPRESSION_NESTING) {
      this._fail(
        `Preprocessor expression nesting exceeds the supported depth of ${MAX_EXPRESSION_NESTING}.`,
        token,
        true
      );
      return false;
    }
    this._nestingDepth++;
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
    case "<<": {
      if (right < 0 || right > 31) return "Shift count must be between 0 and 31 in active preprocessor expression.";
      return left << right;
    }
    case ">>": {
      if (right < 0 || right > 31) return "Shift count must be between 0 and 31 in active preprocessor expression.";
      return (left >>> right) | 0;
    }
    case "+":
      return (left + right) | 0;
    case "-":
      return (left - right) | 0;
    case "*":
      return Math.imul(left, right);
    case "/":
      if (right === 0) return "Division by zero in active preprocessor expression.";
      if (left === -0x80000000 && right === -1) return 0x7fffffff;
      return Math.trunc(left / right) | 0;
    case "%":
      if (right === 0) return "Modulo by zero in active preprocessor expression.";
      return left % right | 0;
    default:
      throw new Error(`Unsupported preprocessor operator '${operator}'.`);
  }
}

function evaluateStaticallyKnownPreprocessorCondition(
  condition: Condition,
  context?: PartiallyKnownPreprocessorExpressionContext
): number | PreprocessorExpressionEvaluationError | undefined {
  switch (condition.t) {
    case "and": {
      const left = evaluateStaticallyKnownPreprocessorCondition(condition.l, context);
      if (typeof left === "string") return left;
      if (left === 0) return 0;
      const right = evaluateStaticallyKnownPreprocessorCondition(condition.r, context);
      if (typeof right === "string") return left === undefined ? undefined : right;
      if (right === 0) return 0;
      return left === undefined || right === undefined ? undefined : 1;
    }
    case "or": {
      const left = evaluateStaticallyKnownPreprocessorCondition(condition.l, context);
      if (typeof left === "string") return left;
      if (left !== undefined && left !== 0) return 1;
      const right = evaluateStaticallyKnownPreprocessorCondition(condition.r, context);
      if (typeof right === "string") return left === undefined ? undefined : right;
      if (right !== undefined && right !== 0) return 1;
      return left === undefined || right === undefined ? undefined : 0;
    }
    case "binary": {
      const left = evaluateStaticallyKnownPreprocessorCondition(condition.l, context);
      const right = evaluateStaticallyKnownPreprocessorCondition(condition.r, context);
      if (typeof left === "string") return left;
      if (typeof right === "string") return right;
      if (left === undefined || right === undefined) {
        return context ? evaluateBoundedIdentifierComparison(condition, left, right) : undefined;
      }
      const value = evaluateBinaryExpression(left, condition.op, right);
      return value;
    }
    case "not": {
      const value = evaluateStaticallyKnownPreprocessorCondition(condition.c, context);
      if (typeof value === "string") return value;
      return value === undefined ? undefined : value === 0 ? 1 : 0;
    }
    case "unary": {
      const value = evaluateStaticallyKnownPreprocessorCondition(condition.c, context);
      if (typeof value === "string") return value;
      if (value === undefined) return undefined;
      return condition.op === "+" ? value | 0 : condition.op === "-" ? -value | 0 : ~value;
    }
    case "bool":
      return condition.v ? 1 : 0;
    case "num":
      return condition.v;
    case "def": {
      const defined = context?.isDefined(condition.m);
      return defined === undefined ? undefined : defined ? 1 : 0;
    }
    case "ndef": {
      const defined = context?.isDefined(condition.m);
      return defined === undefined ? undefined : defined ? 0 : 1;
    }
    case "cmp": {
      const resolved = context?.resolveIdentifier(condition.m);
      if (resolved?.error) return resolved.error as PreprocessorExpressionEvaluationError;
      const value = resolved?.value;
      if (value === undefined) return context ? evaluateUnknownSignedComparison(condition.op, condition.v) : undefined;
      const result = evaluateBinaryExpression(value, condition.op, condition.v);
      return typeof result === "string" ? undefined : result;
    }
    case "id": {
      const resolved = context?.resolveIdentifier(condition.m);
      return resolved?.error ? (resolved.error as PreprocessorExpressionEvaluationError) : resolved?.value;
    }
    case "deferred":
      return undefined;
  }
}

function evaluateBoundedIdentifierComparison(
  condition: Extract<Condition, { t: "binary" }>,
  left: number | undefined,
  right: number | undefined
): number | undefined {
  if (!isComparisonOperator(condition.op)) return undefined;
  if (condition.l.t === "id" && left === undefined && right !== undefined) {
    return evaluateUnknownSignedComparison(condition.op, right);
  }
  if (condition.r.t === "id" && right === undefined && left !== undefined) {
    return evaluateUnknownSignedComparison(reverseComparison(condition.op), left);
  }
  return undefined;
}

function evaluateUnknownSignedComparison(operator: string, value: number): number | undefined {
  if (!isComparisonOperator(operator) || operator === "==" || operator === "!=") return undefined;
  const atMinimum = evaluateBinaryExpression(-0x80000000, operator, value);
  const atMaximum = evaluateBinaryExpression(0x7fffffff, operator, value);
  return typeof atMinimum === "number" && atMinimum === atMaximum ? atMinimum : undefined;
}

function isComparisonOperator(operator: string): boolean {
  return (
    operator === "==" ||
    operator === "!=" ||
    operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">="
  );
}

function reverseComparison(operator: string): string {
  switch (operator) {
    case "<":
      return ">";
    case "<=":
      return ">=";
    case ">":
      return "<";
    case ">=":
      return "<=";
    default:
      return operator;
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
  return charCode === 85 || charCode === 117;
}

function isValidIntegerSuffix(suffix: string): boolean {
  return suffix === "" || suffix === "u" || suffix === "U";
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
