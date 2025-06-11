import { ShaderLab } from "../ShaderLab";
import { EKeyword, ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, EOF } from "../common/BaseToken";
import LexerUtils from "./Utils";

/**
 * The Lexer of ShaderLab Compiler
 */
export class Lexer extends BaseLexer {
  private static _keywordTable = new Map<string, EKeyword>([
    ["const", EKeyword.CONST],
    ["bool", EKeyword.BOOL],
    ["float", EKeyword.FLOAT],
    ["double", EKeyword.DOUBLE],
    ["int", EKeyword.INT],
    ["uint", EKeyword.UINT],
    ["break", EKeyword.BREAK],
    ["continue", EKeyword.CONTINUE],
    ["do", EKeyword.DO],
    ["else", EKeyword.ELSE],
    ["for", EKeyword.FOR],
    ["if", EKeyword.IF],
    ["while", EKeyword.WHILE],
    ["discard", EKeyword.DISCARD],
    ["return", EKeyword.RETURN],
    ["bvec2", EKeyword.BVEC2],
    ["bvec3", EKeyword.BVEC3],
    ["bvec4", EKeyword.BVEC4],
    ["ivec2", EKeyword.IVEC2],
    ["ivec3", EKeyword.IVEC3],
    ["ivec4", EKeyword.IVEC4],
    ["uvec2", EKeyword.UVEC2],
    ["uvec3", EKeyword.UVEC3],
    ["uvec4", EKeyword.UVEC4],
    ["vec2", EKeyword.VEC2],
    ["vec3", EKeyword.VEC3],
    ["vec4", EKeyword.VEC4],
    ["mat2", EKeyword.MAT2],
    ["mat3", EKeyword.MAT3],
    ["mat4", EKeyword.MAT4],
    ["in", EKeyword.IN],
    ["out", EKeyword.OUT],
    ["inout", EKeyword.INOUT],
    ["sampler2D", EKeyword.SAMPLER2D],
    ["samplerCube", EKeyword.SAMPLER_CUBE],
    ["sampler3D", EKeyword.SAMPLER3D],
    ["sampler2DShadow", EKeyword.SAMPLER2D_SHADOW],
    ["samplerCubeShadow", EKeyword.SAMPLER_CUBE_SHADOW],
    ["sampler2DArray", EKeyword.SAMPLER2D_ARRAY],
    ["sampler2DArrayShadow", EKeyword.SAMPLER2D_ARRAY_SHADOW],
    ["isampler2D", EKeyword.I_SAMPLER2D],
    ["isampler3D", EKeyword.I_SAMPLER3D],
    ["isamplerCube", EKeyword.I_SAMPLER_CUBE],
    ["isampler2DArray", EKeyword.I_SAMPLER2D_ARRAY],
    ["usampler2D", EKeyword.U_SAMPLER2D],
    ["usampler3D", EKeyword.U_SAMPLER3D],
    ["usamplerCube", EKeyword.U_SAMPLER_CUBE],
    ["usampler2DArray", EKeyword.U_SAMPLER2D_ARRAY],
    ["struct", EKeyword.STRUCT],
    ["void", EKeyword.VOID],
    ["true", EKeyword.TRUE],
    ["false", EKeyword.FALSE],
    ["precision", EKeyword.PRECISION],
    ["precise", EKeyword.PRECISE],
    ["highp", EKeyword.HIGHP],
    ["mediump", EKeyword.MEDIUMP],
    ["lowp", EKeyword.LOWP],
    ["invariant", EKeyword.INVARIANT],
    ["flat", EKeyword.FLAT],
    ["smooth", EKeyword.SMOOTH],
    ["noperspective", EKeyword.NOPERSPECTIVE],
    ["centroid", EKeyword.CENTROID],
    ["layout", EKeyword.LAYOUT],
    ["location", EKeyword.LOCATION]
  ]);

  reset(source: string) {
    this._source = source;
    this._currentIndex = 0;
    // #if _VERBOSE
    this._line = this._column = 0;
    // #endif
  }

  *tokenize() {
    while (!this.isEnd()) {
      yield this.scanToken();
    }
    return EOF;
  }

  override skipSpace() {
    while (LexerUtils.isSpace(this.getCurCharCode())) {
      this._advance();
    }
  }

  override scanToken(): BaseToken {
    this.skipCommentsAndSpace();
    if (this.isEnd()) {
      return EOF;
    }

    if (LexerUtils.isAlpha(this.getCurCharCode())) {
      return this._scanWord();
    }
    if (LexerUtils.isNum(this.getCurCharCode())) {
      return this._scanNum();
    }

    const start = this._getPosition();
    const token = BaseToken.pool.get();
    let curChar: string;

    switch (this.getCurChar()) {
      case "<":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "<") {
          this._advance();
          if (this.getCurChar() === "=") {
            this._advance();
            token.set(ETokenType.LEFT_ASSIGN, "<<=", start);
            break;
          }
          token.set(ETokenType.LEFT_OP, "<<", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.LE_OP, "<=", start);
          break;
        }
        token.set(ETokenType.LEFT_ANGLE, "<", start);
        break;

      case ">":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === ">") {
          this._advance();
          if (this.getCurChar() === "=") {
            this._advance();
            token.set(ETokenType.RIGHT_ASSIGN, ">>=", start);
            break;
          }
          token.set(ETokenType.RIGHT_OP, ">>", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.GE_OP, ">=", start);
          break;
        }
        token.set(ETokenType.RIGHT_ANGLE, ">", start);
        break;

      case "+":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "+") {
          this._advance();
          token.set(ETokenType.INC_OP, "++", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.ADD_ASSIGN, "+=", start);
          break;
        }
        token.set(ETokenType.PLUS, "+", start);
        break;

      case "-":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "-") {
          this._advance();
          token.set(ETokenType.DEC_OP, "--", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.SUB_ASSIGN, "-=", start);
          break;
        }
        token.set(ETokenType.DASH, "-", start);
        break;

      case "=":
        this._advance();
        if (this.getCurChar() === "=") {
          this._advance();
          token.set(ETokenType.EQ_OP, "==", start);
          break;
        }
        token.set(ETokenType.EQUAL, "=", start);
        break;

      case "!":
        this._advance();
        if (this.getCurChar() === "=") {
          this._advance();
          token.set(ETokenType.NE_OP, "!=", start);
          break;
        }
        token.set(ETokenType.BANG, "!", start);
        break;

      case "&":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "&") {
          this._advance();
          token.set(ETokenType.AND_OP, "&&", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.ADD_ASSIGN, "&=", start);
          break;
        }
        token.set(ETokenType.AMPERSAND, "&", start);
        break;

      case "|":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "|") {
          this._advance();
          token.set(ETokenType.OR_OP, "||", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.OR_ASSIGN, "|=", start);
          break;
        }
        token.set(ETokenType.VERTICAL_BAR, "|", start);
        break;

      case "^":
        this._advance();
        curChar = this.getCurChar();
        if (curChar === "^") {
          this._advance();
          token.set(ETokenType.XOR_OP, "^^", start);
          break;
        } else if (curChar === "=") {
          this._advance();
          token.set(ETokenType.XOR_ASSIGN, "^=", start);
          break;
        }
        token.set(ETokenType.CARET, "^", start);
        break;

      case "*":
        this._advance();
        if (this.getCurChar() === "=") {
          this._advance();
          token.set(ETokenType.MUL_ASSIGN, "*=", start);
          break;
        }

        token.set(ETokenType.STAR, "*", start);
        break;

      case "/":
        this._advance();
        if (this.getCurChar() === "=") {
          this._advance();

          token.set(ETokenType.DIV_ASSIGN, "/=", start);
          break;
        }

        token.set(ETokenType.SLASH, "/", start);
        break;

      case "%":
        this._advance();
        if (this.getCurChar() === "=") {
          this._advance();

          token.set(ETokenType.MOD_ASSIGN, "%=", start);
          break;
        }

        token.set(ETokenType.PERCENT, "%", start);
        break;

      case "(":
        this._advance();

        token.set(ETokenType.LEFT_PAREN, "(", start);
        break;
      case ")":
        this._advance();

        token.set(ETokenType.RIGHT_PAREN, ")", start);
        break;
      case "{":
        this._advance();

        token.set(ETokenType.LEFT_BRACE, "{", start);
        break;
      case "}":
        this._advance();

        token.set(ETokenType.RIGHT_BRACE, "}", start);
        break;
      case "[":
        this._advance();

        token.set(ETokenType.LEFT_BRACKET, "[", start);
        break;
      case "]":
        this._advance();

        token.set(ETokenType.RIGHT_BRACKET, "]", start);
        break;
      case ".":
        this._advance();
        if (LexerUtils.isNum(this.getCurCharCode())) {
          return this._scanNumAfterDot();
        }

        token.set(ETokenType.DOT, ".", start);
        break;
      case ",":
        this._advance();

        token.set(ETokenType.COMMA, ",", start);
        break;
      case ":":
        this._advance();

        token.set(ETokenType.COLON, ":", start);
        return token;
      case ";":
        this._advance();

        token.set(ETokenType.SEMICOLON, ";", start);
        break;
      case "~":
        this._advance();

        token.set(ETokenType.TILDE, "~", start);
        break;
      case "?":
        this._advance();

        token.set(ETokenType.QUESTION, "?", start);
        break;
      case '"':
        this._advance();
        return this._scanStringConst();

      default:
        this.throwError(this.getCurPosition(), `Unexpected character ${this.getCurChar()}`);
    }
    return token;
  }

  private _scanStringConst() {
    const start = this._getPosition();
    const buffer: string[] = [];
    while (this.getCurChar() !== '"') {
      buffer.push(this.getCurChar());
      this._advance();
    }
    this._advance();
    const range = ShaderLab.createRange(start, this._getPosition());

    const token = BaseToken.pool.get();
    token.set(ETokenType.STRING_CONST, buffer.join(""), range);
    return token;
  }

  private _scanNumAfterDot() {
    const buffer = ["."];
    while (LexerUtils.isNum(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this._advance();
    }

    const token = BaseToken.pool.get();
    token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this._getPosition(1));
    return token;
  }

  private _getPosition(offset /** offset from starting point */ = 0) {
    return ShaderLab.createPosition(
      this.current - offset,
      // #if _VERBOSE
      this._line,
      this._column - offset
      // #endif
    );
  }

  private _scanWord() {
    const buffer: string[] = [this.getCurChar()];
    const start = this._getPosition();
    this._advance();
    while (LexerUtils.isLetter(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this._advance();
    }
    const word = buffer.join("");
    const kt = Lexer._keywordTable.get(word);
    if (kt != undefined) {
      const token = BaseToken.pool.get();
      token.set(kt, word, start);
      return token;
    }

    const token = BaseToken.pool.get();
    token.set(ETokenType.ID, word, start);
    return token;
  }

  private _scanNum() {
    const buffer: string[] = [];
    while (LexerUtils.isNum(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this._advance();
    }
    if (this.getCurChar() === ".") {
      buffer.push(this.getCurChar());
      this._advance();
      while (LexerUtils.isNum(this.getCurCharCode())) {
        buffer.push(this.getCurChar());
        this._advance();
      }
      this._scanFloatSuffix(buffer);

      const token = BaseToken.pool.get();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this._getPosition(buffer.length));
      return token;
    } else {
      if (this.getCurChar() === "e" || this.getCurChar() === "E") {
        this._scanFloatSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this._getPosition(buffer.length));
        return token;
      } else {
        this._scanIntegerSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.INT_CONSTANT, buffer.join(""), this._getPosition(buffer.length));
        return token;
      }
    }
  }

  private _scanFloatSuffix(buffer: string[]) {
    if (this.getCurChar() === "e" || this.getCurChar() === "E") {
      buffer.push(this.getCurChar());
      this._advance();
      if (this.getCurChar() === "+" || this.getCurChar() === "-") {
        buffer.push(this.getCurChar());
        this._advance();
      }
      if (!LexerUtils.isNum(this.getCurCharCode()))
        this.throwError(this.getCurPosition(), "lexing error, invalid exponent suffix.");
      while (LexerUtils.isNum(this.getCurCharCode())) {
        buffer.push(this.getCurChar());
        this._advance();
      }
    }
    if (this.getCurChar() === "f" || this.getCurChar() === "F") {
      buffer.push(this.getCurChar());
      this._advance();
    }
  }

  private _scanIntegerSuffix(buffer: string[]) {
    if (this.getCurChar() === "u" || this.getCurChar() === "U") {
      buffer.push(this.getCurChar());
      this._advance();
    }
  }
}
