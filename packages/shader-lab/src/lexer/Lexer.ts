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
    if (this.isEnd()) {
      return EOF;
    }

    if (LexerUtils.isAlpha(this.getCurChar())) {
      return this.scanWord();
    }
    if (LexerUtils.isNum(this.getCurChar())) {
      return this.scanNum();
    }

    const start = this.getPosition();
    const token = BaseToken.pool.get();

    switch (this.getCurChar()) {
      case "<":
        this.advance();
        if (this.getCurChar() === "<") {
          this.advance();
          if (this.getCurChar() === "=") {
            this.advance();
            token.set(ETokenType.LEFT_ASSIGN, "<<=", start);
            break;
          }
          token.set(ETokenType.LEFT_OP, "<<", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.LE_OP, "<=", start);
          break;
        }
        token.set(ETokenType.LEFT_ANGLE, "<", start);
        break;

      case ">":
        this.advance();
        if (this.getCurChar() === ">") {
          this.advance();
          if (this.getCurChar() === "=") {
            this.advance();
            token.set(ETokenType.RIGHT_ASSIGN, ">>=", start);
            break;
          }
          token.set(ETokenType.RIGHT_OP, ">>", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.GE_OP, ">=", start);
          break;
        }
        token.set(ETokenType.RIGHT_ANGLE, ">", start);
        break;

      case "+":
        this.advance();
        if (this.getCurChar() === "+") {
          this.advance();
          token.set(ETokenType.INC_OP, "++", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.ADD_ASSIGN, "+=", start);
          break;
        }
        token.set(ETokenType.PLUS, "+", start);
        break;

      case "-":
        this.advance();
        if (this.getCurChar() === "-") {
          this.advance();
          token.set(ETokenType.DEC_OP, "--", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.SUB_ASSIGN, "-=", start);
          break;
        }
        token.set(ETokenType.DASH, "-", start);
        break;

      case "=":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.EQ_OP, "==", start);
          break;
        }
        token.set(ETokenType.EQUAL, "=", start);
        break;

      case "!":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.NE_OP, "!=", start);
          break;
        }
        token.set(ETokenType.BANG, "!", start);
        break;

      case "&":
        this.advance();
        if (this.getCurChar() === "&") {
          this.advance();
          token.set(ETokenType.AND_OP, "&&", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.ADD_ASSIGN, "&=", start);
          break;
        }
        token.set(ETokenType.AMPERSAND, "&", start);
        break;

      case "|":
        this.advance();
        if (this.getCurChar() === "|") {
          this.advance();
          token.set(ETokenType.OR_OP, "||", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.OR_ASSIGN, "|=", start);
          break;
        }
        token.set(ETokenType.VERTICAL_BAR, "|", start);
        break;

      case "^":
        this.advance();
        if (this.getCurChar() === "^") {
          this.advance();
          token.set(ETokenType.XOR_OP, "^^", start);
          break;
        } else if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.XOR_ASSIGN, "^=", start);
          break;
        }
        token.set(ETokenType.CARET, "^", start);
        break;

      case "*":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();
          token.set(ETokenType.MUL_ASSIGN, "*=", start);
          break;
        }

        token.set(ETokenType.STAR, "*", start);
        break;

      case "/":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();

          token.set(ETokenType.DIV_ASSIGN, "/=", start);
          break;
        }

        token.set(ETokenType.SLASH, "/", start);
        break;

      case "%":
        this.advance();
        if (this.getCurChar() === "=") {
          this.advance();

          token.set(ETokenType.MOD_ASSIGN, "%=", start);
          break;
        }

        token.set(ETokenType.PERCENT, "%", start);
        break;

      case "(":
        this.advance();

        token.set(ETokenType.LEFT_PAREN, "(", start);
        break;
      case ")":
        this.advance();

        token.set(ETokenType.RIGHT_PAREN, ")", start);
        break;
      case "{":
        this.advance();

        token.set(ETokenType.LEFT_BRACE, "{", start);
        break;
      case "}":
        this.advance();

        token.set(ETokenType.RIGHT_BRACE, "}", start);
        break;
      case "[":
        this.advance();

        token.set(ETokenType.LEFT_BRACKET, "[", start);
        break;
      case "]":
        this.advance();

        token.set(ETokenType.RIGHT_BRACKET, "]", start);
        break;
      case ".":
        this.advance();
        if (LexerUtils.isNum(this.getCurChar())) {
          return this.scanNumAfterDot();
        }

        token.set(ETokenType.DOT, ".", start);
        break;
      case ",":
        this.advance();

        token.set(ETokenType.COMMA, ",", start);
        break;
      case ":":
        this.advance();

        token.set(ETokenType.COLON, ":", start);
        return token;
      case ";":
        this.advance();

        token.set(ETokenType.SEMICOLON, ";", start);
        break;
      case "~":
        this.advance();

        token.set(ETokenType.TILDE, "~", start);
        break;
      case "?":
        this.advance();

        token.set(ETokenType.QUESTION, "?", start);
        break;
      case '"':
        this.advance();
        return this.scanStringConst();

      default:
        console.log("at position", start);
        throw `Unexpected character ${this.getCurChar()}`;
    }
    return token;
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

    const token = BaseToken.pool.get();
    token.set(ETokenType.STRING_CONST, buffer.join(""), range);
    return token;
  }

  private scanNumAfterDot() {
    const buffer = ["."];
    while (LexerUtils.isNum(this.getCurChar())) {
      buffer.push(this.getCurChar());
      this.advance();
    }

    const token = BaseToken.pool.get();
    token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(1));
    return token;
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
      const token = BaseToken.pool.get();
      token.set(kt, word, start);
      return token;
    }

    const token = BaseToken.pool.get();
    token.set(ETokenType.ID, word, start);
    return token;
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

      const token = BaseToken.pool.get();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
      return token;
    } else {
      if (this.getCurChar() === "e" || this.getCurChar() === "E") {
        this.scanFloatSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
        return token;
      } else {
        this.scanIntegerSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.INT_CONSTANT, buffer.join(""), this.getPosition(buffer.length));
        return token;
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
