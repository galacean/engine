import { IIndexRange, Position } from "../common";
import { ETokenType, KeywordTable } from "../common";
import { EOF, BaseToken } from "../common/BaseToken";
import LexerUtils from "./Utils";
import BaseScanner from "../common/BaseScanner";

/**
 * The Lexer of ShaderLab Compiler
 */
export default class Lexer extends BaseScanner {
  reset(source: string) {
    this._source = source;
    this._current = 0;
    // #if _DEVELOPMENT
    this._line = this._column = 0;
    // #endif
  }

  *tokenize() {
    while (!this.isEnd()) {
      yield this.scanToken();
    }
    return EOF;
  }

  override scanToken(): BaseToken {
    this.skipCommentsAndSpace();
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
            return new BaseToken(ETokenType.LEFT_ASSIGN, "<<=", start);
          }
          return new BaseToken(ETokenType.LEFT_OP, "<<", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.LE_OP, "<=", start);
        }
        return new BaseToken(ETokenType.LEFT_ANGLE, "<", start);

      case ">":
        this.advance();
        if (this.curChar() === ">") {
          this.advance();
          if (this.curChar() === "=") {
            this.advance();
            return new BaseToken(ETokenType.RIGHT_ASSIGN, ">>=", start);
          }
          return new BaseToken(ETokenType.RIGHT_OP, ">>", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.GE_OP, ">=", start);
        }
        return new BaseToken(ETokenType.RIGHT_ANGLE, ">", start);

      case "+":
        this.advance();
        if (this.curChar() === "+") {
          this.advance();
          return new BaseToken(ETokenType.INC_OP, "++", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.ADD_ASSIGN, "+=", start);
        }
        return new BaseToken(ETokenType.PLUS, "+", start);

      case "-":
        this.advance();
        if (this.curChar() === "-") {
          this.advance();
          return new BaseToken(ETokenType.DEC_OP, "--", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.SUB_ASSIGN, "-=", start);
        }
        return new BaseToken(ETokenType.DASH, "-", start);

      case "=":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.EQ_OP, "==", start);
        }
        return new BaseToken(ETokenType.EQUAL, "=", start);

      case "!":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.NE_OP, "!=", start);
        }
        return new BaseToken(ETokenType.BANG, "!", start);

      case "&":
        this.advance();
        if (this.curChar() === "&") {
          this.advance();
          return new BaseToken(ETokenType.AND_OP, "&&", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.ADD_ASSIGN, "&=", start);
        }
        return new BaseToken(ETokenType.AMPERSAND, "&", start);

      case "|":
        this.advance();
        if (this.curChar() === "|") {
          this.advance();
          return new BaseToken(ETokenType.OR_OP, "||", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.OR_ASSIGN, "|=", start);
        }
        return new BaseToken(ETokenType.VERTICAL_BAR, "|", start);

      case "^":
        this.advance();
        if (this.curChar() === "^") {
          this.advance();
          return new BaseToken(ETokenType.XOR_OP, "^^", start);
        } else if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.XOR_ASSIGN, "^=", start);
        }
        return new BaseToken(ETokenType.CARET, "^", start);

      case "*":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.MUL_ASSIGN, "*=", start);
        }
        return new BaseToken(ETokenType.STAR, "*", start);

      case "/":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.DIV_ASSIGN, "/=", start);
        }
        return new BaseToken(ETokenType.SLASH, "/", start);

      case "%":
        this.advance();
        if (this.curChar() === "=") {
          this.advance();
          return new BaseToken(ETokenType.MOD_ASSIGN, "%=", start);
        }
        return new BaseToken(ETokenType.PERCENT, "%", start);

      case "(":
        this.advance();
        return new BaseToken(ETokenType.LEFT_PAREN, "(", start);
      case ")":
        this.advance();
        return new BaseToken(ETokenType.RIGHT_PAREN, ")", start);
      case "{":
        this.advance();
        return new BaseToken(ETokenType.LEFT_BRACE, "{", start);
      case "}":
        this.advance();
        return new BaseToken(ETokenType.RIGHT_BRACE, "}", start);
      case "[":
        this.advance();
        return new BaseToken(ETokenType.LEFT_BRACKET, "[", start);
      case "]":
        this.advance();
        return new BaseToken(ETokenType.RIGHT_BRACKET, "]", start);
      case ".":
        this.advance();
        if (LexerUtils.isNum(this.curChar())) {
          return this.scanNumAfterDot();
        }
        return new BaseToken(ETokenType.DOT, ".", start);
      case ",":
        this.advance();
        return new BaseToken(ETokenType.COMMA, ",", start);
      case ":":
        this.advance();
        return new BaseToken(ETokenType.COLON, ":", start);
      case ";":
        this.advance();
        return new BaseToken(ETokenType.SEMICOLON, ";", start);
      case "~":
        this.advance();
        return new BaseToken(ETokenType.TILDE, "~", start);
      case "?":
        this.advance();
        return new BaseToken(ETokenType.QUESTION, "?", start);
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
    return new BaseToken(ETokenType.STRING_CONST, buffer.join(""), new IIndexRange(start, this.getPosition()));
  }

  private scanNumAfterDot() {
    const buffer = ["."];
    while (LexerUtils.isNum(this.curChar())) {
      buffer.push(this.curChar());
      this.advance();
    }
    return new BaseToken(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(1));
  }

  private getPosition(offset /** offset from starting point */ = 0) {
    return new Position(
      this.current - offset,
      // #if _DEVELOPMENT
      this._line,
      this._column - offset
      // #endif
    );
  }

  override skipSpace() {
    while (/\s/.test(this.curChar())) {
      this.advance();
    }
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
      return new BaseToken(kt, word, start);
    }
    return new BaseToken(ETokenType.ID, word, start);
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
      return new BaseToken(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
    } else {
      if (this.curChar() === "e" || this.curChar() === "E") {
        this.scanFloatSuffix(buffer);
        return new BaseToken(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      } else {
        this.scanIntegerSuffix(buffer);
        return new BaseToken(ETokenType.INT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
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
