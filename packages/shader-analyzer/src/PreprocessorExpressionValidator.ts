import { DiagnosticSeverity, DiagnosticType, type Diagnostic } from "./Diagnostic";
import { positionAt } from "./sourcePosition";

type TokenKind = "identifier" | "number" | "operator" | "end" | "invalid";

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

interface ParseFailure {
  message: string;
  token: Token;
  certain: boolean;
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
 * Validates preprocessor-expression syntax without evaluating macro configurations.
 * @param source - Shader source containing preprocessor directives.
 * @param sourceFile - Optional canonical source path attached to diagnostics.
 * @returns Diagnostics for syntax errors that remain certain before macro expansion.
 */
export function validatePreprocessorExpressions(source: string, sourceFile?: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const linePattern = /^[\t ]*#[\t ]*(if|elif)\b(.*)$/gm;
  const logicalSource = maskCommentsAndJoinContinuedLines(source);
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(logicalSource))) {
    const expression = match[2];
    const expressionOffset = match.index + match[0].length - expression.length;
    const parser = new ExpressionParser(expression);
    const failure = parser.parse();
    if (!failure || (!failure.certain && parser.sawExpandableIdentifier)) continue;

    const startOffset = expressionOffset + failure.token.start;
    const endOffset = expressionOffset + Math.max(failure.token.end, failure.token.start + 1);
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code: DiagnosticType.PreprocessorError,
      message: failure.message,
      sourceFile,
      range: {
        start: positionAt(source, startOffset),
        end: positionAt(source, Math.min(endOffset, source.length))
      },
      relatedSource: source
    });
  }
  return diagnostics;
}

function maskCommentsAndJoinContinuedLines(source: string): string {
  const characters = source.split("");
  let index = 0;
  let inBlockComment = false;

  while (index < characters.length) {
    if (inBlockComment) {
      if (source.startsWith("*/", index)) {
        characters[index] = characters[index + 1] = " ";
        index += 2;
        inBlockComment = false;
      } else {
        if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
        index++;
      }
      continue;
    }

    if (source.startsWith("//", index)) {
      while (index < characters.length && characters[index] !== "\n" && characters[index] !== "\r") {
        characters[index++] = " ";
      }
      continue;
    }
    if (source.startsWith("/*", index)) {
      characters[index] = characters[index + 1] = " ";
      index += 2;
      inBlockComment = true;
      continue;
    }
    if (characters[index] === "\\") {
      const next = characters[index + 1];
      if (next === "\n") {
        characters[index] = characters[index + 1] = " ";
        index += 2;
        continue;
      }
      if (next === "\r" && characters[index + 2] === "\n") {
        characters[index] = characters[index + 1] = characters[index + 2] = " ";
        index += 3;
        continue;
      }
    }
    index++;
  }

  return characters.join("");
}

class ExpressionParser {
  private readonly _tokens: Token[];
  private _index = 0;
  private _failure?: ParseFailure;
  sawExpandableIdentifier = false;

  constructor(source: string) {
    this._tokens = tokenize(source);
  }

  parse(): ParseFailure | undefined {
    this._parseConditional();
    if (!this._failure) {
      const token = this._current();
      if (token.kind !== "end") {
        const followsExpandableFunctionName = this.sawExpandableIdentifier && token.text === "(";
        const certain = !followsExpandableFunctionName && (token.kind !== "identifier" || token.text === "defined");
        this._fail(`Unexpected token '${token.text}' in preprocessor expression.`, token, certain);
      }
    }
    return this._failure;
  }

  private _parseConditional(): void {
    this._parseBinary(1);
    if (this._failure) return;
    if (!this._consume("?")) return;
    this._parseConditional();
    if (this._failure) return;
    if (!this._consume(":")) {
      this._fail("Expected ':' in conditional preprocessor expression.", this._current(), true);
      return;
    }
    this._parseConditional();
  }

  private _parseBinary(minPrecedence: number): void {
    this._parseUnary();
    if (this._failure) return;
    while (true) {
      const token = this._current();
      const precedence = binaryPrecedence[token.text];
      if (precedence === undefined || precedence < minPrecedence) return;
      this._index++;
      this._parseBinary(precedence + 1);
      if (this._failure) return;
    }
  }

  private _parseUnary(): void {
    const token = this._current();
    if (
      token.kind === "operator" &&
      (token.text === "+" || token.text === "-" || token.text === "!" || token.text === "~")
    ) {
      this._index++;
      this._parseUnary();
      return;
    }
    this._parsePrimary();
  }

  private _parsePrimary(): void {
    const token = this._current();
    if (token.kind === "number") {
      this._index++;
      return;
    }
    if (token.kind === "identifier") {
      if (token.text === "defined") {
        this._parseDefined();
      } else {
        this.sawExpandableIdentifier = true;
        this._index++;
      }
      return;
    }
    if (this._consume("(")) {
      this._parseConditional();
      if (!this._failure && !this._consume(")")) {
        this._fail("Expected ')' in preprocessor expression.", this._current(), false);
      }
      return;
    }
    if (token.kind === "end") {
      this._fail("Expected an operand before the end of the preprocessor expression.", token, true);
    } else {
      this._fail(`Expected an operand, found '${token.text}'.`, token, true);
    }
  }

  private _parseDefined(): void {
    this._index++;
    const parenthesized = this._consume("(");
    const name = this._current();
    if (name.kind !== "identifier" || name.text === "defined") {
      this._fail("Expected a macro name after 'defined'.", name, true);
      return;
    }
    this._index++;
    if (parenthesized && !this._consume(")")) {
      this._fail("Expected ')' after the macro name in 'defined(...)'.", this._current(), true);
    }
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
    this._failure ??= { message, token, certain };
    this._index = this._tokens.length - 1;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const length = source.length;
  while (index < length) {
    const start = index;
    const charCode = source.charCodeAt(index);
    if (isWhitespace(charCode)) {
      index++;
      continue;
    }
    if (charCode === 47 /* / */ && source.charCodeAt(index + 1) === 47 /* / */) break;
    if (charCode === 47 /* / */ && source.charCodeAt(index + 1) === 42 /* * */) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? length : end + 2;
      continue;
    }

    if (isIdentifierStart(charCode)) {
      index++;
      while (index < length && isIdentifierPart(source.charCodeAt(index))) index++;
      tokens.push({ kind: "identifier", text: source.substring(start, index), start, end: index });
      continue;
    }

    if (charCode >= 48 /* 0 */ && charCode <= 57 /* 9 */) {
      if (
        charCode === 48 /* 0 */ &&
        (source.charCodeAt(index + 1) === 88 /* X */ || source.charCodeAt(index + 1) === 120) /* x */ &&
        isHexDigit(source.charCodeAt(index + 2))
      ) {
        index += 3;
        while (index < length && isHexDigit(source.charCodeAt(index))) index++;
      } else if (charCode === 48 /* 0 */) {
        index++;
        while (index < length) {
          const digit = source.charCodeAt(index);
          if (digit < 48 /* 0 */ || digit > 55 /* 7 */) break;
          index++;
        }
      } else {
        index++;
        while (index < length) {
          const digit = source.charCodeAt(index);
          if (digit < 48 /* 0 */ || digit > 57 /* 9 */) break;
          index++;
        }
      }
      for (let suffixLength = 0; suffixLength < 3 && isIntegerSuffix(source.charCodeAt(index)); suffixLength++) {
        index++;
      }
      tokens.push({ kind: "number", text: source.substring(start, index), start, end: index });
      continue;
    }

    if (isDoubleOperator(charCode, source.charCodeAt(index + 1))) {
      index += 2;
      tokens.push({ kind: "operator", text: source.substring(start, index), start, end: index });
      continue;
    }
    if (isSingleOperator(charCode)) {
      index++;
      tokens.push({ kind: "operator", text: source[start], start, end: index });
      continue;
    }
    index++;
    tokens.push({ kind: "invalid", text: source[start], start, end: index });
  }
  tokens.push({ kind: "end", text: "", start: length, end: length });
  return tokens;
}

function isWhitespace(charCode: number): boolean {
  return charCode === 32 /* space */ || (charCode >= 9 /* tab */ && charCode <= 13) /* carriage return */;
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
  return charCode === 76 /* L */ || charCode === 85 /* U */ || charCode === 108 /* l */ || charCode === 117 /* u */;
}

function isDoubleOperator(charCode: number, nextCharCode: number): boolean {
  return (
    (charCode === 124 /* | */ && nextCharCode === 124) ||
    (charCode === 38 /* & */ && nextCharCode === 38) ||
    ((charCode === 33 /* ! */ || charCode === 61) /* = */ && nextCharCode === 61) ||
    ((charCode === 60 /* < */ || charCode === 62) /* > */ && (nextCharCode === 61 || nextCharCode === charCode))
  );
}

function isSingleOperator(charCode: number): boolean {
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
