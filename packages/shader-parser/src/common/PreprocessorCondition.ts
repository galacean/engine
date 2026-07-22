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
 * Parse the supported shader-preprocessor condition grammar.
 *
 * The result is shared by lexical branch analysis and runtime instruction encoding,
 * so both paths accept and interpret the same expressions.
 *
 * @param expression - Text following an `#if` or `#elif` directive.
 * @returns The parsed condition tree.
 * @throws Error when the expression is unsupported or malformed.
 */
export function parsePreprocessorCondition(expression: string): PreprocessorCondition {
  const context: ParserContext = { source: expression.trim(), index: 0 };
  const condition = parseOr(context);
  skipWhitespace(context);
  if (context.index !== context.source.length) throwMalformedPreprocessorCondition(expression);
  return condition;
}

function parseOr(context: ParserContext): PreprocessorCondition {
  let condition = parseAnd(context);
  skipWhitespace(context);
  while (consume(context, "||")) {
    skipWhitespace(context);
    condition = { t: "or", l: condition, r: parseAnd(context) };
    skipWhitespace(context);
  }
  return condition;
}

function parseAnd(context: ParserContext): PreprocessorCondition {
  let condition = parseUnary(context);
  skipWhitespace(context);
  while (consume(context, "&&")) {
    skipWhitespace(context);
    condition = { t: "and", l: condition, r: parseUnary(context) };
    skipWhitespace(context);
  }
  return condition;
}

function parseUnary(context: ParserContext): PreprocessorCondition {
  skipWhitespace(context);
  if (consume(context, "!")) return { t: "not", c: parseUnary(context) };
  return parsePrimary(context);
}

function parsePrimary(context: ParserContext): PreprocessorCondition {
  skipWhitespace(context);
  if (consume(context, "(")) {
    const condition = parseOr(context);
    skipWhitespace(context);
    if (!consume(context, ")")) throwMalformedPreprocessorCondition(context.source);
    return condition;
  }

  const number = scanNumber(context);
  if (number !== undefined) {
    skipWhitespace(context);
    const operator = scanComparisonOperator(context);
    if (!operator) return { t: "bool", v: number !== 0 };
    const value = scanRequiredNumber(context);
    return { t: "bool", v: evaluateNumericComparison(number, operator, value) };
  }

  const identifier = scanIdentifier(context);
  if (!identifier) throwMalformedPreprocessorCondition(context.source);
  if (identifier === "defined") return parseDefined(context);

  skipWhitespace(context);
  const operator = scanComparisonOperator(context);
  if (!operator) return { t: "cmp", m: identifier, op: "!=", v: 0 };
  return { t: "cmp", m: identifier, op: operator, v: scanRequiredNumber(context) };
}

function parseDefined(context: ParserContext): PreprocessorCondition {
  skipWhitespace(context);
  if (consume(context, "(")) {
    skipWhitespace(context);
    const identifier = scanIdentifier(context);
    if (!identifier) throwMalformedPreprocessorCondition(context.source);
    skipWhitespace(context);
    if (!consume(context, ")")) throwMalformedPreprocessorCondition(context.source);
    return { t: "def", m: identifier };
  }

  const identifier = scanIdentifier(context);
  if (!identifier) throwMalformedPreprocessorCondition(context.source);
  return { t: "def", m: identifier };
}

function scanRequiredNumber(context: ParserContext): number {
  skipWhitespace(context);
  const value = scanNumber(context);
  if (value === undefined) throwMalformedPreprocessorCondition(context.source);
  return value;
}

function scanNumber(context: ParserContext): number | undefined {
  const source = context.source;
  NUMBER_RE.lastIndex = context.index;
  const value = NUMBER_RE.exec(source)?.[0];
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throwMalformedPreprocessorCondition(source);
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
