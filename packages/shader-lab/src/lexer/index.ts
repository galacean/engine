import { LocRange, Position } from "../common";
import { ETokenType, KeywordTable } from "../common";
import Token, { EOF } from "../Token";
import LexerUtils from "./Utils";

export default class Lexer {
  private source: string;
  private current = 0;

  private line = 0;
  private column = 0;

  constructor(source: string) {
    this.source = source;
  }

  reset(source: string) {
    this.source = source;
    this.current = this.line = this.column = 0;
  }

  *tokenize() {
    while (!this.isEnd()) {
      yield this.scanToken();
    }
    return EOF;
  }

  private isEnd() {
    return this.current >= this.source.length;
  }

  private scanToken(): Token {
    this.skipSpace();
    this.skipComments();
    if (this.isEnd()) return EOF;

    if (LexerUtils.isAlpha(this.curChar())) {
      return this.scanWord();
    }
    if (LexerUtils.isNum(this.curChar())) {
      return this.scanNum();
    }

    const start = this.getPosition();
    switch (this.curChar()) {
      case "<":
        this.advance();
        if (this.curChar() === "<") {
          this.advance();
          if (this.curChar() === "=") {
            this.advance();
            return new Token(ETokenType.LEFT_ASSIGN, "<<=", start);
          }
          return new Token(ETokenType.LEFT_OP, "<<", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.LE_OP, "<=", start);
        }
        return new Token(ETokenType.LEFT_ANGLE, "<", start);

      case ">":
        this.advance();
        if (this.curChar() === ">") {
          this.advance();
          if (this.curChar() === "=") {
            this.advance();
            return new Token(ETokenType.RIGHT_ASSIGN, ">>=", start);
          }
          return new Token(ETokenType.RIGHT_OP, ">>", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.GE_OP, ">=", start);
        }
        return new Token(ETokenType.RIGHT_ANGLE, ">", start);

      case "+":
        this.advance();
        if (this.curChar() === "+") {
          this.advance();
          return new Token(ETokenType.INC_OP, "++", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.ADD_ASSIGN, "+=", start);
        }
        return new Token(ETokenType.PLUS, "+", start);

      case "-":
        this.advance();
        if (this.curChar() === "-") {
          this.advance();
          return new Token(ETokenType.DEC_OP, "--", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.SUB_ASSIGN, "-=", start);
        }
        return new Token(ETokenType.DASH, "-", start);

      case "=":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.EQ_OP, "==", start);
        }
        return new Token(ETokenType.EQUAL, "=", start);

      case "!":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.NE_OP, "!=", start);
        }
        return new Token(ETokenType.BANG, "!", start);

      case "&":
        this.advance();
        if (this.curChar() === "&") {
          this.advance();
          return new Token(ETokenType.AND_OP, "&&", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.ADD_ASSIGN, "&=", start);
        }
        return new Token(ETokenType.AMPERSAND, "&", start);

      case "|":
        this.advance();
        if (this.curChar() === "|") {
          this.advance();
          return new Token(ETokenType.OR_OP, "||", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.OR_ASSIGN, "|=", start);
        }
        return new Token(ETokenType.VERTICAL_BAR, "|", start);

      case "^":
        this.advance();
        if (this.curChar() === "^") {
          this.advance();
          return new Token(ETokenType.XOR_OP, "^^", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.XOR_ASSIGN, "^=", start);
        }
        return new Token(ETokenType.CARET, "^", start);

      case "*":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.MUL_ASSIGN, "*=", start);
        }
        return new Token(ETokenType.STAR, "*", start);

      case "/":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.DIV_ASSIGN, "/=", start);
        }
        return new Token(ETokenType.SLASH, "/", start);

      case "%":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new Token(ETokenType.MOD_ASSIGN, "%=", start);
        }
        return new Token(ETokenType.PERCENT, "%", start);

      case "(":
        this.advance();
        return new Token(ETokenType.LEFT_PAREN, "(", start);
      case ")":
        this.advance();
        return new Token(ETokenType.RIGHT_PAREN, ")", start);
      case "{":
        this.advance();
        return new Token(ETokenType.LEFT_BRACE, "{", start);
      case "}":
        this.advance();
        return new Token(ETokenType.RIGHT_BRACE, "}", start);
      case "[":
        this.advance();
        return new Token(ETokenType.LEFT_BRACKET, "[", start);
      case "]":
        this.advance();
        return new Token(ETokenType.RIGHT_BRACKET, "]", start);
      case ".":
        this.advance();
        if (LexerUtils.isNum(this.curChar())) {
          return this.scanNumAfterDot();
        }
        return new Token(ETokenType.DOT, ".", start);
      case ",":
        this.advance();
        return new Token(ETokenType.COMMA, ",", start);
      case ":":
        this.advance();
        return new Token(ETokenType.COLON, ":", start);
      case ";":
        this.advance();
        return new Token(ETokenType.SEMICOLON, ";", start);
      case "~":
        this.advance();
        return new Token(ETokenType.TILDE, "~", start);
      case "?":
        this.advance();
        return new Token(ETokenType.QUESTION, "?", start);
      case '"':
        this.advance();
        return this.scanStringConst();

      default:
        console.log("at position", start);
        throw `Unexpected character ${this.curChar()}`;
    }
  }

  private scanStringConst() {
    const start = this.getPosition();
    const buffer: string[] = [];
    while (this.curChar() !== '"') {
      buffer.push(this.curChar());
      this.advance();
    }
    this.advance();
    return new Token(ETokenType.STRING_CONST, buffer.join(""), new LocRange(start, this.getPosition()));
  }

  private scanNumAfterDot() {
    const buffer = ["."];
    while (LexerUtils.isNum(this.curChar())) {
      buffer.push(this.curChar());
      this.advance();
    }
    return new Token(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(1));
  }

  private advance() {
    if (this.isEnd()) return;
    if (this.curChar() === "\n") {
      this.line += 1;
      this.column = 0;
    } else {
      this.column += 1;
    }
    this.current++;
  }

  private curChar() {
    return this.source[this.current];
  }

  private peek() {
    return this.source[this.current + 1];
  }

  private getPosition(offset /** offset from starting point */ = 0) {
    return new Position(this.current - offset, this.line, this.column - offset);
  }

  private skipSpace() {
    while (/\s/.test(this.curChar())) {
      this.advance();
    }
  }

  private skipComments() {
    if (this.curChar() === "/") {
      if (this.peek() === "/") {
        // single line comments
        while (this.curChar() !== "\n") this.advance();
        this.advance();
      } else if (this.peek() === "*") {
        //  multi-line comments
        this.advance();
        while (this.curChar() !== "*" || this.peek() !== "/") this.advance();
        this.advance();
        this.advance();
      } else return;
    } else return;
    this.skipSpace();
    this.skipComments();
  }

  private scanWord() {
    const buffer: string[] = [this.curChar()];
    const start = this.getPosition();
    this.advance();
    while (LexerUtils.isLetter(this.curChar())) {
      buffer.push(this.curChar());
      this.advance();
    }
    const word = buffer.join("");
    const kt = KeywordTable.get(word);
    if (kt) {
      return new Token(kt, word, start);
    }
    return new Token(ETokenType.ID, word, start);
  }

  private scanNum() {
    const buffer: string[] = [];
    while (LexerUtils.isNum(this.curChar())) {
      buffer.push(this.curChar());
      this.advance();
    }
    if (this.curChar() === ".") {
      buffer.push(this.curChar());
      this.advance();
      while (LexerUtils.isNum(this.curChar())) {
        buffer.push(this.curChar());
        this.advance();
      }
      this.scanFloatSuffix(buffer);
      return new Token(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
    } else {
      if (this.curChar() === "e" || this.curChar() === "E") {
        this.scanFloatSuffix(buffer);
        return new Token(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      } else {
        this.scanIntegerSuffix(buffer);
        return new Token(ETokenType.INT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      }
    }
  }

  private scanFloatSuffix(buffer: string[]) {
    if (this.curChar() === "e" || this.curChar() === "E") {
      buffer.push(this.curChar());
      this.advance();
      if (this.curChar() === "+" || this.curChar() === "-") {
        buffer.push(this.curChar());
        this.advance();
      }
      if (!LexerUtils.isNum(this.curChar())) throw "lexing error, invalid exponent suffix.";
      while (LexerUtils.isNum(this.curChar())) {
        buffer.push(this.curChar());
        this.advance();
      }
    }
    if (this.curChar() === "f" || this.curChar() === "F") {
      buffer.push(this.curChar());
      this.advance();
    }
  }

  private scanIntegerSuffix(buffer: string[]) {
    if (this.curChar() === "u" || this.curChar() === "U") {
      buffer.push(this.curChar());
      this.advance();
    }
  }
}
