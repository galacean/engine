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
  /** Whether an identifier may expand into missing syntax. */
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
 * One object-like or function-like shader macro.
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

/**
 * Result of shader source macro expansion, including a deterministic failure when expansion stops.
 */
export interface ShaderMacroExpansionResult {
  /** Expanded source with preprocessing token boundaries and comments preserved. */
  readonly source: string;
  /** Deterministic expansion failure. */
  readonly error?: string;
}

type TokenKind = "identifier" | "number" | "operator" | "end" | "invalid" | "trivia";

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
const MAX_MACRO_EXPANSION_TOKENS = 65536;

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
  const expanded = expandMacroTokens(tokenize(expression).slice(0, -1), resolveMacro, tokenize, true, 0, {
    remaining: MAX_MACRO_EXPANSION_TOKENS
  });
  return typeof expanded === "string"
    ? { expression: "", error: expanded }
    : { expression: expanded.map((token) => token.text).join(" ") };
}

/**
 * Expands shader macros using the same argument prescan and rescan rules as conditional expressions.
 * @param source - Shader text without macro definition or conditional directives.
 * @param resolveMacro - Resolves the macro state active at this source location.
 * @returns Expanded shader source, or a deterministic expansion-limit error.
 */
export function expandShaderMacros(
  source: string,
  resolveMacro: (name: string) => PreprocessorExpressionMacro | undefined
): ShaderMacroExpansionResult {
  const expanded = expandMacroTokens(
    tokenizeShader(source).slice(0, -1),
    resolveMacro,
    tokenizeShaderReplacement,
    false,
    0,
    { remaining: MAX_MACRO_EXPANSION_TOKENS }
  );
  return typeof expanded === "string" ? { source: "", error: expanded } : { source: serializeShaderTokens(expanded) };
}

interface ExpansionToken extends Token {
  readonly disabledMacros?: ReadonlySet<string>;
  readonly expansionDepth?: number;
}

function expandMacroTokens(
  input: readonly ExpansionToken[],
  resolveMacro: (name: string) => PreprocessorExpressionMacro | undefined,
  tokenizeReplacement: (source: string) => Token[],
  protectDefined: boolean,
  depth: number,
  budget: { remaining: number }
): ExpansionToken[] | string {
  const tokens = input.slice();
  const output: ExpansionToken[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (protectDefined && token.text === "defined") {
      output.push(token);
      index++;
      const count = tokens[index]?.text === "(" ? 3 : 1;
      for (let i = 0; i < count && index < tokens.length; i++) output.push(tokens[index++]);
      continue;
    }
    const macro =
      token.kind === "identifier" && !token.disabledMacros?.has(token.text) ? resolveMacro(token.text) : undefined;
    let openParen = index + 1;
    if (macro?.parameters) {
      while (tokens[openParen]?.kind === "trivia") openParen++;
    }
    if (!macro || (macro.parameters && tokens[openParen]?.text !== "(")) {
      output.push(token);
      index++;
      continue;
    }

    const expansionDepth = Math.max(depth, token.expansionDepth ?? 0) + 1;
    if (expansionDepth > MAX_MACRO_EXPANSION_DEPTH) {
      return `Preprocessor macro expansion exceeds ${MAX_MACRO_EXPANSION_DEPTH} nested replacements.`;
    }
    let invocationEnd = index;
    let args: readonly ExpansionToken[][] = [];
    const disabledMacros = new Set(token.disabledMacros);
    if (macro.parameters) {
      const invocation = parseMacroInvocation(tokens, openParen);
      if (!invocation) {
        output.push(token);
        index++;
        continue;
      }
      args = invocation.arguments;
      if (macro.parameters.length === 0 && args.length === 1 && args[0].every((token) => token.kind === "trivia")) {
        args = [];
      }
      if (args.length !== macro.parameters.length) {
        output.push(token);
        index++;
        continue;
      }
      invocationEnd = invocation.end;
      // A function invocation inherits only exclusions present at both invocation boundaries
      const closingExclusions = tokens[invocationEnd].disabledMacros;
      for (const name of disabledMacros) {
        if (!closingExclusions?.has(name)) disabledMacros.delete(name);
      }
    }
    disabledMacros.add(token.text);

    const replacement: ExpansionToken[] = [];
    const expandedArguments = new Map<number, ExpansionToken[]>();
    for (const bodyToken of tokenizeReplacement(macro.body).slice(0, -1)) {
      const parameter = bodyToken.kind === "identifier" ? (macro.parameters?.indexOf(bodyToken.text) ?? -1) : -1;
      let substituted: readonly ExpansionToken[] = [bodyToken];
      if (parameter >= 0) {
        let argument = expandedArguments.get(parameter);
        if (!argument) {
          // Arguments expand before this invocation disables its own name, including ID(ID(1))
          const expanded = expandMacroTokens(
            args[parameter],
            resolveMacro,
            tokenizeReplacement,
            protectDefined,
            expansionDepth,
            budget
          );
          if (typeof expanded === "string") return expanded;
          expandedArguments.set(parameter, (argument = expanded));
        }
        substituted = argument;
      }
      for (const part of substituted) {
        if (--budget.remaining < 0)
          return `Preprocessor macro expansion exceeds ${MAX_MACRO_EXPANSION_TOKENS} replacement tokens.`;
        // Only macro names and invocation closing boundaries carry exclusions into later rescans.
        if (part.kind !== "identifier" && part.text !== ")") {
          replacement.push(part);
          continue;
        }
        let exclusions = disabledMacros;
        if (part.disabledMacros?.size) {
          exclusions = new Set(disabledMacros);
          part.disabledMacros.forEach((name) => exclusions.add(name));
        }
        replacement.push({
          ...part,
          disabledMacros: exclusions,
          expansionDepth: Math.max(expansionDepth, part.expansionDepth ?? 0)
        });
      }
    }
    // Rescan in place so an object alias can form a call with the following original tokens
    tokens.splice(index, invocationEnd - index + 1, ...replacement);
  }
  return output;
}

const shaderMultiOperators = new Set([
  "<<=",
  ">>=",
  "++",
  "--",
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "^^",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "^=",
  "|=",
  "##"
]);

// Shader replacement lists use preprocessing numbers, not the integer-only #if grammar.
function tokenizeShader(source: string, removeComments = false): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const start = index;
    const char = source.charCodeAt(index++);
    let kind: TokenKind;
    let comment = false;
    if (isWhitespace(char)) {
      kind = "trivia";
      while (isWhitespace(source.charCodeAt(index))) index++;
    } else if (char === 47 && source[index] === "/") {
      kind = "trivia";
      comment = true;
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index++;
    } else if (char === 47 && source[index] === "*") {
      kind = "trivia";
      comment = true;
      const close = source.indexOf("*/", index + 1);
      index = close < 0 ? source.length : close + 2;
    } else if (char === 34 || char === 39) {
      kind = "invalid";
      while (index < source.length) {
        const next = source.charCodeAt(index++);
        if (next === 92) index = Math.min(index + 1, source.length);
        else if (next === char) break;
      }
    } else if (isIdentifierStart(char)) {
      kind = "identifier";
      while (isIdentifierPart(source.charCodeAt(index))) index++;
    } else if ((char >= 48 && char <= 57) || (char === 46 && /[0-9]/.test(source[index] ?? ""))) {
      kind = "number";
      while (index < source.length) {
        const next = source.charCodeAt(index);
        if (isIdentifierPart(next) || next === 46) index++;
        else if ((next === 43 || next === 45) && /[eEpP]/.test(source[index - 1])) index++;
        else break;
      }
    } else {
      kind = "operator";
      if (char === 60 || char === 62) {
        if (shaderMultiOperators.has(source.slice(start, start + 3))) index = start + 3;
        else if (shaderMultiOperators.has(source.slice(start, start + 2))) index = start + 2;
      } else if ("+-*/%&|^!=#".includes(source[start]) && shaderMultiOperators.has(source.slice(start, start + 2))) {
        index = start + 2;
      }
    }
    const text = source.slice(start, index);
    tokens.push({
      kind,
      text: removeComments && comment ? text.replace(/[^\r\n]/g, "") || " " : text,
      start,
      end: index
    });
  }
  tokens.push({ kind: "end", text: "", start: index, end: index });
  return tokens;
}

function tokenizeShaderReplacement(source: string): Token[] {
  // A comment in a replacement list is whitespace; a trailing // must not swallow the caller's suffix.
  return tokenizeShader(source, true);
}

function serializeShaderTokens(tokens: readonly ExpansionToken[]): string {
  const parts: string[] = [];
  let previous: ExpansionToken | undefined;
  for (const token of tokens) {
    if (previous && previous.kind !== "trivia" && token.kind !== "trivia") {
      const word = previous.kind === "identifier" || previous.kind === "number";
      const nextWord = token.kind === "identifier" || token.kind === "number";
      const joined = previous.kind === "operator" && token.kind === "operator" ? previous.text + token.text : "";
      // Replacement must not join two preprocessing tokens into a new number, operator or comment.
      if (
        (word && nextWord) ||
        (previous.kind === "number" &&
          (token.text === "." || (/[eEpP]$/.test(previous.text) && /^[+-]/.test(token.text)))) ||
        (previous.text === "." && token.kind === "number") ||
        (joined && previous.text.length < 2 && shaderMultiOperators.has(joined.slice(0, 2))) ||
        (joined && previous.text.length < 3 && shaderMultiOperators.has(joined.slice(0, 3))) ||
        joined.startsWith("//") ||
        joined.startsWith("/*")
      )
        parts.push(" ");
    }
    parts.push(token.text);
    previous = token;
  }
  return parts.join("");
}

function parseMacroInvocation(
  tokens: readonly ExpansionToken[],
  openParen: number
): { readonly arguments: ExpansionToken[][]; readonly end: number } | undefined {
  const args: ExpansionToken[][] = [[]];
  let depth = 1;
  for (let index = openParen + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.text === "(") {
      depth++;
      args[args.length - 1].push(token);
    } else if (token.text === ")") {
      if (--depth === 0) {
        for (const argument of args) trimMacroArgument(argument);
        return { arguments: args, end: index };
      }
      args[args.length - 1].push(token);
    } else if (token.text === "," && depth === 1) {
      args.push([]);
    } else {
      args[args.length - 1].push(token);
    }
  }
}

function trimMacroArgument(tokens: ExpansionToken[]): void {
  // Call-site padding is not part of the replacement. Keep comments and line breaks intact.
  for (const trailing of [false, true]) {
    while (tokens.length) {
      const index = trailing ? tokens.length - 1 : 0;
      const token = tokens[index];
      if (token.kind !== "trivia") break;
      const text = token.text.replace(trailing ? /[ \t\v\f]+$/ : /^[ \t\v\f]+/, "");
      if (text === token.text) break;
      if (text) {
        tokens[index] = { ...token, text };
        break;
      }
      if (trailing) tokens.pop();
      else tokens.shift();
    }
  }
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

const DIVISION_BY_ZERO_ERROR: PreprocessorExpressionEvaluationError =
  "Division by zero in active preprocessor expression.";
const MODULO_BY_ZERO_ERROR: PreprocessorExpressionEvaluationError = "Modulo by zero in active preprocessor expression.";
const INVALID_SHIFT_COUNT_ERROR: PreprocessorExpressionEvaluationError =
  "Shift count must be between 0 and 31 in active preprocessor expression.";

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
    const evaluated = this._sawExpandableIdentifier
      ? undefined
      : evaluateStaticallyKnownPreprocessorCondition(condition!);
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
          unsupportedConditionalOperator ||
          (!this._rightEdgeExpandable &&
            !unexpectedExpandableIdentifier &&
            !(token.text === ")" && this._sawExpandableIdentifier));
        this._fail(`Unexpected token '${token.text}' in preprocessor expression.`, token, certain);
      }
    }
    return condition;
  }

  private _invalidResult(): InvalidPreprocessorExpression | undefined {
    if (this._failure) {
      // A macro supplying a closing delimiter may be the token where parsing stopped.
      for (let i = this._index; i < this._tokens.length; i++) {
        const token = this._tokens[i];
        if (token.kind === "identifier" && token.text !== "defined") {
          this._sawExpandableIdentifier = true;
          break;
        }
      }
    }
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
      if (right < 0 || right > 31) return INVALID_SHIFT_COUNT_ERROR;
      return left << right;
    }
    case ">>": {
      if (right < 0 || right > 31) return INVALID_SHIFT_COUNT_ERROR;
      return (left >>> right) | 0;
    }
    case "+":
      return (left + right) | 0;
    case "-":
      return (left - right) | 0;
    case "*":
      return Math.imul(left, right);
    case "/":
      if (right === 0) return DIVISION_BY_ZERO_ERROR;
      if (left === -0x80000000 && right === -1) return 0x7fffffff;
      return Math.trunc(left / right) | 0;
    case "%":
      if (right === 0) return MODULO_BY_ZERO_ERROR;
      return left % right | 0;
    default:
      throw new Error(`Unsupported preprocessor operator '${operator}'.`);
  }
}

function validateBinaryRightOperand(
  operator: string,
  right: number | undefined
): PreprocessorExpressionEvaluationError | undefined {
  if ((operator === "/" || operator === "%") && right === 0) {
    return operator === "/" ? DIVISION_BY_ZERO_ERROR : MODULO_BY_ZERO_ERROR;
  }
  if ((operator === "<<" || operator === ">>") && right !== undefined && (right < 0 || right > 31)) {
    return INVALID_SHIFT_COUNT_ERROR;
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
      const rightOperandError = validateBinaryRightOperand(condition.op, right);
      if (rightOperandError) return rightOperandError;
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
