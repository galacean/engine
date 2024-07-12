import { ShaderRange, ShaderPosition } from "../common";
import { ETokenType, KeywordTable } from "../common";
import { EOF, BaseToken } from "../common/BaseToken";
import LexerUtils from "./Utils";
import BaseScanner from "../common/BaseScanner";
import { ShaderLab } from "../ShaderLab";

/**
 * The Lexer of ShaderLab Compiler
 */
export class Lexer extends BaseScanner {
  reset(source: string) {
    this._source = source;
    this._currentIndex = 0;
    // #if _EDITOR
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

    if (LexerUtils.isAlpha(this.getCurChar())) {
      return this.scanWord();
    }
    if (LexerUtils.isNum(this.getCurChar())) {
      return this.scanNum();
    }

    const start = this.getPosition();
    switch (this.getCurChar()) {
      case "<":
        this.advance();
        if (this.getCurChar() === "<") {
          this.advance();
          if (this.getCurChar() === "=") {
            this.advance();
            return BaseToken.pool.get(ETokenType.LEFT_ASSIGN, "<<=", start);
          }
          return BaseToken.pool.get(ETokenType.LEFT_OP, "<<", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.LE_OP, "<=", start);
        }
        return BaseToken.pool.get(ETokenType.LEFT_ANGLE, "<", start);

      case ">":
        this.advance();
        if (this.getCurChar() === ">") {
          this.advance();
          if (this.getCurChar() === "=") {
            this.advance();
            return BaseToken.pool.get(ETokenType.RIGHT_ASSIGN, ">>=", start);
          }
          return BaseToken.pool.get(ETokenType.RIGHT_OP, ">>", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.GE_OP, ">=", start);
        }
        return BaseToken.pool.get(ETokenType.RIGHT_ANGLE, ">", start);

      case "+":
        this.advance();
        if (this.getCurChar() === "+") {
          this.advance();
          return BaseToken.pool.get(ETokenType.INC_OP, "++", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.ADD_ASSIGN, "+=", start);
        }
        return BaseToken.pool.get(ETokenType.PLUS, "+", start);

      case "-":
        this.advance();
        if (this.getCurChar() === "-") {
          this.advance();
          return BaseToken.pool.get(ETokenType.DEC_OP, "--", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.SUB_ASSIGN, "-=", start);
        }
        return BaseToken.pool.get(ETokenType.DASH, "-", start);

      case "=":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.EQ_OP, "==", start);
        }
        return BaseToken.pool.get(ETokenType.EQUAL, "=", start);

      case "!":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.NE_OP, "!=", start);
        }
        return BaseToken.pool.get(ETokenType.BANG, "!", start);

      case "&":
        this.advance();
        if (this.getCurChar() === "&") {
          this.advance();
          return BaseToken.pool.get(ETokenType.AND_OP, "&&", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.ADD_ASSIGN, "&=", start);
        }
        return BaseToken.pool.get(ETokenType.AMPERSAND, "&", start);

      case "|":
        this.advance();
        if (this.getCurChar() === "|") {
          this.advance();
          return BaseToken.pool.get(ETokenType.OR_OP, "||", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.OR_ASSIGN, "|=", start);
        }
        return BaseToken.pool.get(ETokenType.VERTICAL_BAR, "|", start);

      case "^":
        this.advance();
        if (this.getCurChar() === "^") {
          this.advance();
          return BaseToken.pool.get(ETokenType.XOR_OP, "^^", start);
        } else if (this.getCurChar() === "=") {
          this.advance();
          return BaseToken.pool.get(ETokenType.XOR_ASSIGN, "^=", start);
        }
        return BaseToken.pool.get(ETokenType.CARET, "^", start);

      case "*":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();

          return BaseToken.pool.get(ETokenType.MUL_ASSIGN, "*=", start);
        }

        return BaseToken.pool.get(ETokenType.STAR, "*", start);

      case "/":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();

          return BaseToken.pool.get(ETokenType.DIV_ASSIGN, "/=", start);
        }

        return BaseToken.pool.get(ETokenType.SLASH, "/", start);

      case "%":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();

          return BaseToken.pool.get(ETokenType.MOD_ASSIGN, "%=", start);
        }

        return BaseToken.pool.get(ETokenType.PERCENT, "%", start);

      case "(":
        this.advance();

        return BaseToken.pool.get(ETokenType.LEFT_PAREN, "(", start);
      case ")":
        this.advance();

        return BaseToken.pool.get(ETokenType.RIGHT_PAREN, ")", start);
      case "{":
        this.advance();

        return BaseToken.pool.get(ETokenType.LEFT_BRACE, "{", start);
      case "}":
        this.advance();

        return BaseToken.pool.get(ETokenType.RIGHT_BRACE, "}", start);
      case "[":
        this.advance();

        return BaseToken.pool.get(ETokenType.LEFT_BRACKET, "[", start);
      case "]":
        this.advance();

        return BaseToken.pool.get(ETokenType.RIGHT_BRACKET, "]", start);
      case ".":
        this.advance();
        if (LexerUtils.isNum(this.getCurChar())) {
          return this.scanNumAfterDot();
        }

        return BaseToken.pool.get(ETokenType.DOT, ".", start);
      case ",":
        this.advance();

        return BaseToken.pool.get(ETokenType.COMMA, ",", start);
      case ":":
        this.advance();

        return BaseToken.pool.get(ETokenType.COLON, ":", start);
      case ";":
        this.advance();

        return BaseToken.pool.get(ETokenType.SEMICOLON, ";", start);
      case "~":
        this.advance();

        return BaseToken.pool.get(ETokenType.TILDE, "~", start);
      case "?":
        this.advance();

        return BaseToken.pool.get(ETokenType.QUESTION, "?", start);
      case '"':
        this.advance();
        return this.scanStringConst();

      default:
        console.log("at position", start);
        throw `Unexpected character ${this.getCurChar()}`;
    }
  }

  private scanStringConst() {
    const start = this.getPosition();
    const buffer: string[] = [];
    while (this.getCurChar() !== '"') {
      buffer.push(this.getCurChar());
      this.advance();
    }
    this.advance();
    const range = ShaderLab.createRange(start, this.getPosition());

    return BaseToken.pool.get(ETokenType.STRING_CONST, buffer.join(""), range);
  }

  private scanNumAfterDot() {
    const buffer = ["."];
    while (LexerUtils.isNum(this.getCurChar())) {
      buffer.push(this.getCurChar());
      this.advance();
    }

    return BaseToken.pool.get(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(1));
  }

  private getPosition(offset /** offset from starting point */ = 0) {
    return ShaderLab.createPosition(
      this.current - offset,
      // #if _EDITOR
      this._line,
      this._column - offset
      // #endif
    );
  }

  override skipSpace() {
    while (/\s/.test(this.getCurChar())) {
      this.advance();
    }
  }

  private scanWord() {
    const buffer: string[] = [this.getCurChar()];
    const start = this.getPosition();
    this.advance();
    while (LexerUtils.isLetter(this.getCurChar())) {
      buffer.push(this.getCurChar());
      this.advance();
    }
    const word = buffer.join("");
    const kt = KeywordTable.get(word);
    if (kt) {
      return BaseToken.pool.get(kt, word, start);
    }

    return BaseToken.pool.get(ETokenType.ID, word, start);
  }

  private scanNum() {
    const buffer: string[] = [];
    while (LexerUtils.isNum(this.getCurChar())) {
      buffer.push(this.getCurChar());
      this.advance();
    }
    if (this.getCurChar() === ".") {
      buffer.push(this.getCurChar());
      this.advance();
      while (LexerUtils.isNum(this.getCurChar())) {
        buffer.push(this.getCurChar());
        this.advance();
      }
      this.scanFloatSuffix(buffer);

      return BaseToken.pool.get(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
    } else {
      if (this.getCurChar() === "e" || this.getCurChar() === "E") {
        this.scanFloatSuffix(buffer);

        return BaseToken.pool.get(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      } else {
        this.scanIntegerSuffix(buffer);

        return BaseToken.pool.get(ETokenType.INT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      }
    }
  }

  private scanFloatSuffix(buffer: string[]) {
    if (this.getCurChar() === "e" || this.getCurChar() === "E") {
      buffer.push(this.getCurChar());
      this.advance();
      if (this.getCurChar() === "+" || this.getCurChar() === "-") {
        buffer.push(this.getCurChar());
        this.advance();
      }
      if (!LexerUtils.isNum(this.getCurChar())) throw "lexing error, invalid exponent suffix.";
      while (LexerUtils.isNum(this.getCurChar())) {
        buffer.push(this.getCurChar());
        this.advance();
      }
    }
    if (this.getCurChar() === "f" || this.getCurChar() === "F") {
      buffer.push(this.getCurChar());
      this.advance();
    }
  }

  private scanIntegerSuffix(buffer: string[]) {
    if (this.getCurChar() === "u" || this.getCurChar() === "U") {
      buffer.push(this.getCurChar());
      this.advance();
    }
  }
}
