import type { BoolCondition, CompareCondition, DefinedCondition } from "@galacean/engine-design";

/**
 * Parsed condition accepted by `#if` and `#elif` directives.
 *
 * `#ifndef` is represented by its own directive and is therefore outside this expression grammar.
 */
export type PreprocessorCondition =
  | BoolCondition
  | CompareCondition
  | DefinedCondition
  | { t: "and"; l: PreprocessorCondition; r: PreprocessorCondition }
  | { t: "or"; l: PreprocessorCondition; r: PreprocessorCondition }
  | { t: "not"; c: PreprocessorCondition };

const NUMBER_RE = /[-+]?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)/y;

interface ParserContext {
  source: string;
  index: number;
}

/**
 * Parse the subset of shader-preprocessor conditions used for branch reasoning.
 *
 * The result is shared by lexical branch analysis and runtime instruction encoding,
 * so both paths accept and interpret the same expressions.
 *
 * @param expression - Text following an `#if` or `#elif` directive.
 * @returns The parsed condition tree.
 * @throws Error when the expression cannot be represented by this limited reasoning model.
 */
export function parsePreprocessorCondition(expression: string): PreprocessorCondition {
  const condition = tryParsePreprocessorCondition(expression);
  if (!condition) throwMalformedPreprocessorCondition(expression);
  return condition;
}

/**
 * Parses a preprocessor condition without using exceptions for unsupported expressions.
 * @param expression - Text following an `#if` or `#elif` directive.
 * @returns The parsed condition tree, or `undefined` when the limited reasoning model cannot represent it.
 * @internal
 */
export function tryParsePreprocessorCondition(expression: string): PreprocessorCondition | undefined {
  const context: ParserContext = { source: expression.trim(), index: 0 };
  const condition = parseOr(context);
  if (!condition) return undefined;
  skipWhitespace(context);
  return context.index === context.source.length ? condition : undefined;
}

function parseOr(context: ParserContext): PreprocessorCondition | undefined {
  let condition = parseAnd(context);
  if (!condition) return undefined;
  skipWhitespace(context);
  while (consume(context, "||")) {
    skipWhitespace(context);
    const right = parseAnd(context);
    if (!right) return undefined;
    condition = { t: "or", l: condition, r: right };
    skipWhitespace(context);
  }
  return condition;
}

function parseAnd(context: ParserContext): PreprocessorCondition | undefined {
  let condition = parseUnary(context);
  if (!condition) return undefined;
  skipWhitespace(context);
  while (consume(context, "&&")) {
    skipWhitespace(context);
    const right = parseUnary(context);
    if (!right) return undefined;
    condition = { t: "and", l: condition, r: right };
    skipWhitespace(context);
  }
  return condition;
}

function parseUnary(context: ParserContext): PreprocessorCondition | undefined {
  skipWhitespace(context);
  if (consume(context, "!")) {
    const condition = parseUnary(context);
    return condition ? { t: "not", c: condition } : undefined;
  }
  return parsePrimary(context);
}

function parsePrimary(context: ParserContext): PreprocessorCondition | undefined {
  skipWhitespace(context);
  if (consume(context, "(")) {
    const condition = parseOr(context);
    if (!condition) return undefined;
    skipWhitespace(context);
    return consume(context, ")") ? condition : undefined;
  }

  const number = scanNumber(context);
  if (number !== undefined) {
    skipWhitespace(context);
    const operator = scanComparisonOperator(context);
    if (!operator) return { t: "bool", v: number !== 0 };
    const value = scanRequiredNumber(context);
    return value === undefined ? undefined : { t: "bool", v: evaluateNumericComparison(number, operator, value) };
  }

  const identifier = scanIdentifier(context);
  if (!identifier) return undefined;
  if (identifier === "defined") return parseDefined(context);

  skipWhitespace(context);
  const operator = scanComparisonOperator(context);
  if (!operator) return { t: "cmp", m: identifier, op: "!=", v: 0 };
  const value = scanRequiredNumber(context);
  return value === undefined ? undefined : { t: "cmp", m: identifier, op: operator, v: value };
}

function parseDefined(context: ParserContext): PreprocessorCondition | undefined {
  skipWhitespace(context);
  if (consume(context, "(")) {
    skipWhitespace(context);
    const identifier = scanIdentifier(context);
    if (!identifier) return undefined;
    skipWhitespace(context);
    return consume(context, ")") ? { t: "def", m: identifier } : undefined;
  }

  const identifier = scanIdentifier(context);
  return identifier ? { t: "def", m: identifier } : undefined;
}

function scanRequiredNumber(context: ParserContext): number | undefined {
  skipWhitespace(context);
  return scanNumber(context);
}

function scanNumber(context: ParserContext): number | undefined {
  const source = context.source;
  NUMBER_RE.lastIndex = context.index;
  const value = NUMBER_RE.exec(source)?.[0];
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < -0x80000000 || parsed > 0x7fffffff) {
    return undefined;
  }
  context.index += value.length;
  return parsed;
}

function scanIdentifier(context: ParserContext): string | undefined {
  const source = context.source;
  const start = context.index;
  const first = source.charCodeAt(start);
  if (!isIdentifierStart(first)) return undefined;

  context.index++;
  while (isIdentifierPart(source.charCodeAt(context.index))) context.index++;
  return source.slice(start, context.index);
}

function scanComparisonOperator(context: ParserContext): "==" | "!=" | ">" | ">=" | "<" | "<=" | undefined {
  if (consume(context, "==")) return "==";
  if (consume(context, "!=")) return "!=";
  if (consume(context, ">=")) return ">=";
  if (consume(context, "<=")) return "<=";
  if (consume(context, ">")) return ">";
  if (consume(context, "<")) return "<";
  return undefined;
}

function evaluateNumericComparison(
  left: number,
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=",
  right: number
): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
  }
}

function skipWhitespace(context: ParserContext): void {
  const source = context.source;
  while (source.charCodeAt(context.index) === 32 /* space */ || source.charCodeAt(context.index) === 9 /* tab */) {
    context.index++;
  }
}

function consume(context: ParserContext, token: string): boolean {
  if (!context.source.startsWith(token, context.index)) return false;
  context.index += token.length;
  return true;
}

function isIdentifierStart(charCode: number): boolean {
  return (
    (charCode >= 65 /* A */ && charCode <= 90) /* Z */ ||
    (charCode >= 97 /* a */ && charCode <= 122) /* z */ ||
    charCode === 95 /* _ */
  );
}

function isIdentifierPart(charCode: number): boolean {
  return isIdentifierStart(charCode) || (charCode >= 48 /* 0 */ && charCode <= 57); /* 9 */
}

function throwMalformedPreprocessorCondition(expression: string): never {
  throw new Error(`Unsupported or malformed preprocessor condition '${expression}'.`);
}
