import type { Condition, ShaderInstruction } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "./enums/ShaderPreprocessorDirective";

interface FuncMacro {
  params: string[];
  body: string;
}

/**
 * @internal
 */
export class ShaderMacroProcessor {
  private static _valueMacros = new Map<string, string>();
  private static _funcMacros = new Map<string, FuncMacro>();
  private static _shaderChunks: string[] = [];
  private static _out: string[] = [];
  private static _expandedNames = new Set<string>();
  private static _macroFirstChars = new Set<number>();
  private static _macroFirstCharsDirty = true;
  private static _replaceWordParts: string[] = [];
  private static _parsedFuncArgs = { values: [] as string[], end: 0 };

  /**
   * Evaluate a flat instruction array with active macros.
   * Macros are expanded immediately when text chunks are collected,
   * using the current macro state at that point (conforming to GLSL/C99 §6.10 standard).
   * @param instructions - Pre-parsed instruction array
   * @param macros - Active runtime macros
   * @returns Pure GLSL string with all conditionals resolved and macros expanded
   */
  static evaluate(instructions: ShaderInstruction[], macros: Map<string, string>): string {
    const valueMacros = ShaderMacroProcessor._valueMacros;
    const funcMacros = ShaderMacroProcessor._funcMacros;
    const shaderChunks = ShaderMacroProcessor._shaderChunks;

    valueMacros.clear();
    funcMacros.clear();
    shaderChunks.length = 0;

    for (const [name, value] of macros) {
      valueMacros.set(name, value);
    }
    ShaderMacroProcessor._macroFirstCharsDirty = true;

    let index = 0;
    const length = instructions.length;

    while (index < length) {
      const instruction = instructions[index];
      switch (instruction[0]) {
        case ShaderPreprocessorDirective.Text:
          // Immediately expand macros using current macro state (GLSL/C99 conformant)
          shaderChunks.push(ShaderMacroProcessor._expandChunk(<string>instruction[1], valueMacros, funcMacros));
          index++;
          break;
        case ShaderPreprocessorDirective.IfDef: {
          const name = <string>instruction[1];
          index = valueMacros.has(name) || funcMacros.has(name) ? index + 1 : <number>instruction[2];
          break;
        }
        case ShaderPreprocessorDirective.IfNdef: {
          const name = <string>instruction[1];
          index = !valueMacros.has(name) && !funcMacros.has(name) ? index + 1 : <number>instruction[2];
          break;
        }
        case ShaderPreprocessorDirective.IfCmp: {
          const name = <string>instruction[1];
          const val = valueMacros.get(name);
          const matched =
            val !== undefined &&
            ShaderMacroProcessor._compareValues(Number(val) || 0, <string>instruction[2], <number>instruction[3]);
          index = matched ? index + 1 : <number>instruction[4];
          break;
        }
        case ShaderPreprocessorDirective.IfExpr:
          index = ShaderMacroProcessor._evalCondition(<Condition>instruction[1], valueMacros, funcMacros)
            ? index + 1
            : <number>instruction[2];
          break;
        case ShaderPreprocessorDirective.Else:
          index = <number>instruction[1];
          break;
        case ShaderPreprocessorDirective.Endif:
          index++;
          break;
        case ShaderPreprocessorDirective.Define:
          valueMacros.set(<string>instruction[1], "");
          index++;
          break;
        case ShaderPreprocessorDirective.DefineVal:
          valueMacros.set(<string>instruction[1], <string>instruction[2]);
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        case ShaderPreprocessorDirective.DefineFunc:
          funcMacros.set(<string>instruction[1], { params: <string[]>instruction[2], body: <string>instruction[3] });
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        case ShaderPreprocessorDirective.Undef:
          valueMacros.delete(<string>instruction[1]);
          funcMacros.delete(<string>instruction[1]);
          index++;
          break;
        default:
          index++;
          break;
      }
    }

    return ShaderMacroProcessor._concatChunks(shaderChunks);
  }

  /**
   * Expand macros in a single text chunk using the current macro state.
   * Returns the chunk as-is if no expandable macros exist.
   */
  private static _expandChunk(
    chunk: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): string {
    // Fast path: no expandable macros at this point
    if (funcMacros.size === 0) {
      let hasExpandable = false;
      for (const [, val] of valueMacros) {
        if (val !== "") {
          hasExpandable = true;
          break;
        }
      }
      if (!hasExpandable) return chunk;
    }

    // Rebuild first-char filter if macros changed
    if (ShaderMacroProcessor._macroFirstCharsDirty) {
      const macroFirstChars = ShaderMacroProcessor._macroFirstChars;
      macroFirstChars.clear();
      for (const name of valueMacros.keys()) macroFirstChars.add(name.charCodeAt(0));
      for (const name of funcMacros.keys()) macroFirstChars.add(name.charCodeAt(0));
      ShaderMacroProcessor._macroFirstCharsDirty = false;
    }

    const macroFirstChars = ShaderMacroProcessor._macroFirstChars;
    const expandedNames = ShaderMacroProcessor._expandedNames;
    const out = ShaderMacroProcessor._out;
    out.length = 0;
    const len = chunk.length;
    let i = 0;

    while (i < len) {
      const cc = chunk.charCodeAt(i);

      if (ShaderMacroProcessor._isIdentifierStart(cc)) {
        const start = i;
        i++;
        while (i < len && ShaderMacroProcessor._isIdentifierPart(chunk.charCodeAt(i))) i++;

        // Fast path: first char not in any macro name
        if (!macroFirstChars.has(chunk.charCodeAt(start))) {
          out.push(chunk.substring(start, i));
          continue;
        }

        const name = chunk.substring(start, i);

        // Try function macro
        const func = funcMacros.get(name);
        if (func) {
          let lookAhead = i;
          while (
            lookAhead < len &&
            (chunk.charCodeAt(lookAhead) === 32 /* space */ || chunk.charCodeAt(lookAhead) === 9) /* tab */
          )
            lookAhead++;
          if (lookAhead < len && chunk.charCodeAt(lookAhead) === 40 /* '(' */) {
            const args = ShaderMacroProcessor._parseFuncArgs(chunk, lookAhead);
            if (args) {
              i = args.end;
              const expanded = ShaderMacroProcessor._expandFuncBody(func, args.values);
              expandedNames.clear();
              expandedNames.add(name);
              out.push(ShaderMacroProcessor._recursiveExpandMacro(expanded, valueMacros, funcMacros, expandedNames));
              continue;
            }
          }
        }

        // Try value macro
        const val = valueMacros.get(name);
        if (val !== undefined && val !== "") {
          expandedNames.clear();
          expandedNames.add(name);
          out.push(ShaderMacroProcessor._recursiveExpandMacro(val, valueMacros, funcMacros, expandedNames));
          continue;
        }

        out.push(name);
        continue;
      }

      // Batch collect non-identifier characters
      const batchStart = i;
      while (i < len && !ShaderMacroProcessor._isIdentifierStart(chunk.charCodeAt(i))) i++;
      out.push(chunk.substring(batchStart, i));
    }

    return out.join("");
  }

  /**
   * Recursively expand macro substitution results until no more macros remain.
   * @param macroExpansion - Intermediate text from a macro substitution that may contain further macro references
   * @param valueMacros - Current value macro definitions
   * @param funcMacros - Current function macro definitions
   * @param expandedNames - Macro names already on the expansion chain, prevents circular references (C99 §6.10.3.4)
   */
  private static _recursiveExpandMacro(
    macroExpansion: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>,
    expandedNames: Set<string>
  ): string {
    if (macroExpansion.length === 0) return macroExpansion;

    const len = macroExpansion.length;
    const out: string[] = [];
    let i = 0;

    while (i < len) {
      const cc = macroExpansion.charCodeAt(i);
      if (ShaderMacroProcessor._isIdentifierStart(cc)) {
        const start = i;
        i++;
        while (i < len && ShaderMacroProcessor._isIdentifierPart(macroExpansion.charCodeAt(i))) i++;
        const name = macroExpansion.substring(start, i);

        // Skip already-expanded names (circular reference prevention)
        // Skip GL_ prefixed names (reserved GLSL built-ins, charCodes: G=71, L=76, _=95)
        if (
          expandedNames.has(name) ||
          (name.charCodeAt(0) === 71 && name.charCodeAt(1) === 76 && name.charCodeAt(2) === 95)
        ) {
          out.push(name);
          continue;
        }

        const func = funcMacros.get(name);
        if (func) {
          let lookAhead = i;
          while (
            lookAhead < len &&
            (macroExpansion.charCodeAt(lookAhead) === 32 /* space */ ||
              macroExpansion.charCodeAt(lookAhead) === 9) /* tab */
          )
            lookAhead++;
          if (lookAhead < len && macroExpansion.charCodeAt(lookAhead) === 40 /* '(' */) {
            const args = ShaderMacroProcessor._parseFuncArgs(macroExpansion, lookAhead);
            if (args) {
              i = args.end;
              expandedNames.add(name);
              out.push(
                ShaderMacroProcessor._recursiveExpandMacro(
                  ShaderMacroProcessor._expandFuncBody(func, args.values),
                  valueMacros,
                  funcMacros,
                  expandedNames
                )
              );
              expandedNames.delete(name);
              continue;
            }
          }
        }

        const val = valueMacros.get(name);
        if (val !== undefined && val !== "") {
          expandedNames.add(name);
          out.push(ShaderMacroProcessor._recursiveExpandMacro(val, valueMacros, funcMacros, expandedNames));
          expandedNames.delete(name);
          continue;
        }

        out.push(name);
        continue;
      }

      // Batch collect non-identifier characters
      const batchStart = i;
      while (i < len && !ShaderMacroProcessor._isIdentifierStart(macroExpansion.charCodeAt(i))) i++;
      out.push(macroExpansion.substring(batchStart, i));
    }

    return out.join("");
  }

  /**
   * Substitute function macro params in body.
   */
  private static _expandFuncBody(func: FuncMacro, args: string[]): string {
    if (func.params.length === 0 || args.length !== func.params.length) return func.body;

    let result = func.body;
    for (let i = 0; i < func.params.length; i++) {
      result = ShaderMacroProcessor._replaceWord(result, func.params[i], args[i]);
    }
    return result;
  }

  /**
   * Evaluate a compound condition tree.
   */
  private static _evalCondition(
    cond: Condition,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    switch (cond.t) {
      case "def":
        return valueMacros.has(cond.m) || funcMacros.has(cond.m);
      case "ndef":
        return !valueMacros.has(cond.m) && !funcMacros.has(cond.m);
      case "cmp": {
        const val = valueMacros.get(cond.m);
        if (val === undefined) return false;
        return ShaderMacroProcessor._compareValues(Number(val) || 0, cond.op, cond.v);
      }
      case "and":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, valueMacros, funcMacros) &&
          ShaderMacroProcessor._evalCondition(cond.r, valueMacros, funcMacros)
        );
      case "or":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, valueMacros, funcMacros) ||
          ShaderMacroProcessor._evalCondition(cond.r, valueMacros, funcMacros)
        );
      case "not":
        return !ShaderMacroProcessor._evalCondition(cond.c, valueMacros, funcMacros);
      case "bool":
        return cond.v;
      case "raw":
        return ShaderMacroProcessor._evalRawCondition(cond.e, valueMacros, funcMacros);
    }
  }

  private static _evalRawCondition(
    expression: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    const withDefinedValues = expression.replace(
      /\bdefined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))/g,
      (_match, parenthesized: string | undefined, bare: string | undefined) => {
        const name = parenthesized ?? bare!;
        return valueMacros.has(name) || funcMacros.has(name) ? "1" : "0";
      }
    );
    const expandedNames = ShaderMacroProcessor._expandedNames;
    expandedNames.clear();
    const expanded = ShaderMacroProcessor._recursiveExpandMacro(
      withDefinedValues,
      valueMacros,
      funcMacros,
      expandedNames
    );
    const value = new PreprocessorExpressionEvaluator(expanded).evaluate();
    return value !== undefined && value !== 0;
  }

  /**
   * Evaluate a comparison operator.
   */
  private static _compareValues(numVal: number, op: string, value: number): boolean {
    numVal |= 0;
    value |= 0;
    switch (op) {
      case "==":
        return numVal === value;
      case "!=":
        return numVal !== value;
      case ">":
        return numVal > value;
      case "<":
        return numVal < value;
      case ">=":
        return numVal >= value;
      case "<=":
        return numVal <= value;
      default:
        return false;
    }
  }

  /**
   * Parse function macro call arguments.
   * Returns reusable static result object to avoid allocation.
   */
  private static _parseFuncArgs(text: string, openParen: number): { values: string[]; end: number } | null {
    const result = ShaderMacroProcessor._parsedFuncArgs;
    result.values.length = 0;
    let level = 1;
    let argStart = openParen + 1;
    let k = argStart;
    const len = text.length;

    while (k < len && level > 0) {
      const cc = text.charCodeAt(k);
      if (cc === 40 /* '(' */) {
        level++;
      } else if (cc === 41 /* ')' */) {
        if (--level === 0) {
          const arg = text.substring(argStart, k).trim();
          if (arg.length > 0 || result.values.length > 0) result.values.push(arg);
          result.end = k + 1;
          return result;
        }
      } else if (cc === 44 /* ',' */ && level === 1) {
        result.values.push(text.substring(argStart, k).trim());
        argStart = k + 1;
      }
      k++;
    }
    return null;
  }

  /**
   * Replace all whole-word occurrences of `word` in `text` with `replacement`.
   */
  private static _replaceWord(text: string, word: string, replacement: string): string {
    const wLen = word.length;
    const parts = ShaderMacroProcessor._replaceWordParts;
    parts.length = 0;
    let start = 0;
    let idx = text.indexOf(word, start);

    while (idx !== -1) {
      if (idx > 0 && ShaderMacroProcessor._isIdentifierPart(text.charCodeAt(idx - 1))) {
        idx = text.indexOf(word, idx + 1);
        continue;
      }
      const afterIdx = idx + wLen;
      if (afterIdx < text.length && ShaderMacroProcessor._isIdentifierPart(text.charCodeAt(afterIdx))) {
        idx = text.indexOf(word, idx + 1);
        continue;
      }
      parts.push(text.substring(start, idx));
      parts.push(replacement);
      start = afterIdx;
      idx = text.indexOf(word, start);
    }

    if (start === 0) return text;
    parts.push(text.substring(start));
    return parts.join("");
  }

  /**
   * Concatenate shader chunks with consecutive blank lines collapsed to a single newline.
   */
  private static _concatChunks(shaderChunks: string[]): string {
    const out = ShaderMacroProcessor._out;
    out.length = 0;
    let lastNewline = false;

    for (let p = 0; p < shaderChunks.length; p++) {
      const text = shaderChunks[p];
      const len = text.length;
      let i = 0;

      while (i < len) {
        if (text.charCodeAt(i) === 10 /* \n */) {
          if (!lastNewline) {
            out.push("\n");
            lastNewline = true;
          }
          i++;
          while (i < len) {
            const c = text.charCodeAt(i);
            if (c === 32 /* space */ || c === 9 /* tab */ || c === 10 /* \n */) i++;
            else break;
          }
        } else {
          const batchStart = i;
          while (i < len && text.charCodeAt(i) !== 10 /* \n */) i++;
          out.push(text.substring(batchStart, i));
          lastNewline = false;
        }
      }
    }

    return out.join("");
  }

  /**
   * Check if char code is a valid identifier start.
   * Matches: [A-Z] | [a-z] | _
   */
  private static _isIdentifierStart(charCode: number): boolean {
    return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || charCode === 95;
  }

  /**
   * Check if char code is a valid identifier part.
   * Matches: [A-Z] | [a-z] | [0-9] | _
   */
  private static _isIdentifierPart(charCode: number): boolean {
    return (
      (charCode >= 65 && charCode <= 90) ||
      (charCode >= 97 && charCode <= 122) ||
      (charCode >= 48 && charCode <= 57) ||
      charCode === 95
    );
  }
}

type ExpressionTokenKind = "number" | "identifier" | "operator" | "invalid" | "end";

interface ExpressionToken {
  kind: ExpressionTokenKind;
  text: string;
}

const expressionPrecedence: Readonly<Record<string, number>> = {
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

class PreprocessorExpressionEvaluator {
  private readonly _tokens: ExpressionToken[];
  private _index = 0;
  private _valid = true;

  constructor(expression: string) {
    this._tokens = tokenizePreprocessorExpression(expression);
  }

  evaluate(): number | undefined {
    const value = this._parseConditional(true);
    if (this._current().kind !== "end") this._invalidate();
    return this._valid ? value : undefined;
  }

  private _parseConditional(active: boolean): number {
    const condition = this._parseBinary(1, active);
    if (!this._consume("?")) return condition;
    const whenTrue = this._parseConditional(active && condition !== 0);
    if (!this._consume(":")) return this._invalidate();
    const whenFalse = this._parseConditional(active && condition === 0);
    return !active ? 0 : condition !== 0 ? whenTrue : whenFalse;
  }

  private _parseBinary(minPrecedence: number, active: boolean): number {
    let left = this._parseUnary(active);
    while (true) {
      const operator = this._current().text;
      const precedence = expressionPrecedence[operator];
      if (precedence === undefined || precedence < minPrecedence) return left;
      this._index++;
      const rightActive = active && !((operator === "&&" && left === 0) || (operator === "||" && left !== 0));
      const right = this._parseBinary(precedence + 1, rightActive);
      if (active) {
        const value = evaluateBinaryExpression(left, operator, right);
        if (value === undefined) return this._invalidate();
        left = value;
      }
    }
  }

  private _parseUnary(active: boolean): number {
    const token = this._current();
    if (
      token.kind === "operator" &&
      (token.text === "+" || token.text === "-" || token.text === "!" || token.text === "~")
    ) {
      this._index++;
      const value = this._parseUnary(active);
      if (!active) return 0;
      switch (token.text) {
        case "+":
          return value | 0;
        case "-":
          return -value | 0;
        case "!":
          return value === 0 ? 1 : 0;
        case "~":
          return ~value;
      }
    }
    return this._parsePrimary(active);
  }

  private _parsePrimary(active: boolean): number {
    const token = this._current();
    if (token.kind === "number") {
      this._index++;
      return active ? parseIntegerLiteral(token.text) : 0;
    }
    if (token.kind === "identifier") {
      this._index++;
      return 0;
    }
    if (this._consume("(")) {
      const value = this._parseConditional(active);
      if (!this._consume(")")) return this._invalidate();
      return value;
    }
    return this._invalidate();
  }

  private _consume(text: string): boolean {
    if (this._current().text !== text) return false;
    this._index++;
    return true;
  }

  private _current(): ExpressionToken {
    return this._tokens[this._index];
  }

  private _invalidate(): number {
    this._valid = false;
    this._index = this._tokens.length - 1;
    return 0;
  }
}

function tokenizePreprocessorExpression(expression: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  const length = expression.length;
  while (index < length) {
    const charCode = expression.charCodeAt(index);
    if (isExpressionWhitespace(charCode)) {
      index++;
      continue;
    }
    if (charCode === 47 /* / */ && expression.charCodeAt(index + 1) === 47 /* / */) break;
    if (charCode === 47 /* / */ && expression.charCodeAt(index + 1) === 42 /* * */) {
      const end = expression.indexOf("*/", index + 2);
      if (end < 0) {
        tokens.push({ kind: "invalid", text: expression.substring(index) });
        break;
      }
      index = end + 2;
      continue;
    }

    if (isExpressionIdentifierStart(charCode)) {
      const start = index++;
      while (index < length && isExpressionIdentifierPart(expression.charCodeAt(index))) index++;
      tokens.push({ kind: "identifier", text: expression.substring(start, index) });
      continue;
    }

    if (charCode >= 48 /* 0 */ && charCode <= 57 /* 9 */) {
      const start = index;
      if (
        charCode === 48 /* 0 */ &&
        (expression.charCodeAt(index + 1) === 88 /* X */ || expression.charCodeAt(index + 1) === 120) /* x */ &&
        isExpressionHexDigit(expression.charCodeAt(index + 2))
      ) {
        index += 3;
        while (index < length && isExpressionHexDigit(expression.charCodeAt(index))) index++;
      } else if (charCode === 48 /* 0 */) {
        index++;
        while (index < length) {
          const digit = expression.charCodeAt(index);
          if (digit < 48 /* 0 */ || digit > 55 /* 7 */) break;
          index++;
        }
      } else {
        index++;
        while (index < length) {
          const digit = expression.charCodeAt(index);
          if (digit < 48 /* 0 */ || digit > 57 /* 9 */) break;
          index++;
        }
      }
      for (let suffixLength = 0; suffixLength < 3 && isIntegerSuffix(expression.charCodeAt(index)); suffixLength++) {
        index++;
      }
      tokens.push({ kind: "number", text: expression.substring(start, index) });
      continue;
    }

    const nextCharCode = expression.charCodeAt(index + 1);
    if (isDoubleExpressionOperator(charCode, nextCharCode)) {
      tokens.push({ kind: "operator", text: expression.substring(index, index + 2) });
      index += 2;
      continue;
    }
    if (isSingleExpressionOperator(charCode)) {
      tokens.push({ kind: "operator", text: expression[index] });
      index++;
      continue;
    }
    tokens.push({ kind: "invalid", text: expression[index] });
    break;
  }
  tokens.push({ kind: "end", text: "" });
  return tokens;
}

function parseIntegerLiteral(literal: string): number {
  let end = literal.length;
  while (end > 0 && isIntegerSuffix(literal.charCodeAt(end - 1))) end--;
  if (literal.charCodeAt(0) === 48 /* 0 */) {
    const prefix = literal.charCodeAt(1);
    if (prefix === 88 /* X */ || prefix === 120 /* x */) return parseInt(literal.substring(2, end), 16) | 0;
    if (end > 1) return parseInt(literal.substring(0, end), 8) | 0;
  }
  return Number(literal.substring(0, end)) | 0;
}

function evaluateBinaryExpression(left: number, operator: string, right: number): number | undefined {
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
      if (right === 0) return undefined;
      return Math.trunc(left / right) | 0;
    case "%":
      if (right === 0) return undefined;
      return left % right | 0;
    default:
      return undefined;
  }
}

function isExpressionWhitespace(charCode: number): boolean {
  return charCode === 32 /* space */ || (charCode >= 9 /* tab */ && charCode <= 13) /* carriage return */;
}

function isExpressionIdentifierStart(charCode: number): boolean {
  return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || charCode === 95;
}

function isExpressionIdentifierPart(charCode: number): boolean {
  return isExpressionIdentifierStart(charCode) || (charCode >= 48 && charCode <= 57);
}

function isExpressionHexDigit(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) || (charCode >= 65 && charCode <= 70) || (charCode >= 97 && charCode <= 102)
  );
}

function isIntegerSuffix(charCode: number): boolean {
  return charCode === 76 /* L */ || charCode === 85 /* U */ || charCode === 108 /* l */ || charCode === 117 /* u */;
}

function isDoubleExpressionOperator(charCode: number, nextCharCode: number): boolean {
  return (
    (charCode === 124 /* | */ && nextCharCode === 124) ||
    (charCode === 38 /* & */ && nextCharCode === 38) ||
    ((charCode === 33 /* ! */ || charCode === 61) /* = */ && nextCharCode === 61) ||
    ((charCode === 60 /* < */ || charCode === 62) /* > */ && (nextCharCode === 61 || nextCharCode === charCode))
  );
}

function isSingleExpressionOperator(charCode: number): boolean {
  switch (charCode) {
    case 33: // !
    case 37: // %
    case 38: // &
    case 40: // (
    case 41: // )
    case 42: // *
    case 43: // +
    case 45: // -
    case 47: // /
    case 58: // :
    case 60: // <
    case 62: // >
    case 63: // ?
    case 94: // ^
    case 124: // |
    case 126: // ~
      return true;
    default:
      return false;
  }
}
