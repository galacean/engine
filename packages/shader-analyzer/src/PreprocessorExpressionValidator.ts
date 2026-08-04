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

class ExpressionParseFailure extends Error implements ParseFailure {
  constructor(
    message: string,
    readonly token: Token,
    readonly certain: boolean
  ) {
    super(message);
  }
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
 * @param file - Optional logical source name attached to diagnostics.
 * @returns Diagnostics for syntax errors that remain certain before macro expansion.
 */
export function validatePreprocessorExpressions(source: string, file?: string): Diagnostic[] {
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
      file,
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
  sawExpandableIdentifier = false;

  constructor(source: string) {
    this._tokens = tokenize(source);
  }

  parse(): ParseFailure | undefined {
    try {
      this._parseConditional();
      const token = this._current();
      if (token.kind !== "end") {
        const followsExpandableFunctionName = this.sawExpandableIdentifier && token.text === "(";
        const certain = !followsExpandableFunctionName && (token.kind !== "identifier" || token.text === "defined");
        this._fail(`Unexpected token '${token.text}' in preprocessor expression.`, token, certain);
      }
    } catch (failure) {
      if (failure instanceof ExpressionParseFailure) return failure;
      throw failure;
    }
  }

  private _parseConditional(): void {
    this._parseBinary(1);
    if (!this._consume("?")) return;
    this._parseConditional();
    if (!this._consume(":")) this._fail("Expected ':' in conditional preprocessor expression.", this._current(), true);
    this._parseConditional();
  }

  private _parseBinary(minPrecedence: number): void {
    this._parseUnary();
    while (true) {
      const token = this._current();
      const precedence = binaryPrecedence[token.text];
      if (precedence === undefined || precedence < minPrecedence) return;
      this._index++;
      this._parseBinary(precedence + 1);
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
      if (!this._consume(")")) this._fail("Expected ')' in preprocessor expression.", this._current(), false);
      return;
    }
    if (token.kind === "end")
      this._fail("Expected an operand before the end of the preprocessor expression.", token, true);
    this._fail(`Expected an operand, found '${token.text}'.`, token, true);
  }

  private _parseDefined(): void {
    this._index++;
    const parenthesized = this._consume("(");
    const name = this._current();
    if (name.kind !== "identifier" || name.text === "defined") {
      this._fail("Expected a macro name after 'defined'.", name, true);
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

  private _fail(message: string, token: Token, certain: boolean): never {
    throw new ExpressionParseFailure(message, token, certain);
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const start = index;
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (source.startsWith("//", index)) break;
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))?.[0];
    if (identifier) {
      index += identifier.length;
      tokens.push({ kind: "identifier", text: identifier, start, end: index });
      continue;
    }
    const number = /^(?:0[xX][0-9A-Fa-f]+|0[0-7]*|[1-9][0-9]*)(?:[uUlL]{0,3})/.exec(source.slice(index))?.[0];
    if (number) {
      index += number.length;
      tokens.push({ kind: "number", text: number, start, end: index });
      continue;
    }
    const operator = ["||", "&&", "==", "!=", "<=", ">=", "<<", ">>"].find((candidate) =>
      source.startsWith(candidate, index)
    );
    if (operator) {
      index += operator.length;
      tokens.push({ kind: "operator", text: operator, start, end: index });
      continue;
    }
    if ("|^&<>+-*/%!~?:()".includes(char)) {
      index++;
      tokens.push({ kind: "operator", text: char, start, end: index });
      continue;
    }
    index++;
    tokens.push({ kind: "invalid", text: char, start, end: index });
  }
  tokens.push({ kind: "end", text: "", start: source.length, end: source.length });
  return tokens;
}
