import { ShaderLab } from "../ShaderLab";
import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, EOF } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import LexerUtils from "./Utils";

/**
 * The Lexer of ShaderLab Compiler
 */
export class Lexer extends BaseLexer {
  private static _lexemeTable = <Record<string, Keyword>>{
    const: Keyword.CONST,
    bool: Keyword.BOOL,
    float: Keyword.FLOAT,
    double: Keyword.DOUBLE,
    int: Keyword.INT,
    uint: Keyword.UINT,
    break: Keyword.BREAK,
    continue: Keyword.CONTINUE,
    do: Keyword.DO,
    else: Keyword.ELSE,
    for: Keyword.FOR,
    if: Keyword.IF,
    while: Keyword.WHILE,
    discard: Keyword.DISCARD,
    return: Keyword.RETURN,
    bvec2: Keyword.BVEC2,
    bvec3: Keyword.BVEC3,
    bvec4: Keyword.BVEC4,
    ivec2: Keyword.IVEC2,
    ivec3: Keyword.IVEC3,
    ivec4: Keyword.IVEC4,
    uvec2: Keyword.UVEC2,
    uvec3: Keyword.UVEC3,
    uvec4: Keyword.UVEC4,
    vec2: Keyword.VEC2,
    vec3: Keyword.VEC3,
    vec4: Keyword.VEC4,
    mat2: Keyword.MAT2,
    mat3: Keyword.MAT3,
    mat4: Keyword.MAT4,
    in: Keyword.IN,
    out: Keyword.OUT,
    inout: Keyword.INOUT,
    sampler2D: Keyword.SAMPLER2D,
    samplerCube: Keyword.SAMPLER_CUBE,
    sampler3D: Keyword.SAMPLER3D,
    sampler2DShadow: Keyword.SAMPLER2D_SHADOW,
    samplerCubeShadow: Keyword.SAMPLER_CUBE_SHADOW,
    sampler2DArray: Keyword.SAMPLER2D_ARRAY,
    sampler2DArrayShadow: Keyword.SAMPLER2D_ARRAY_SHADOW,
    isampler2D: Keyword.I_SAMPLER2D,
    isampler3D: Keyword.I_SAMPLER3D,
    isamplerCube: Keyword.I_SAMPLER_CUBE,
    isampler2DArray: Keyword.I_SAMPLER2D_ARRAY,
    usampler2D: Keyword.U_SAMPLER2D,
    usampler3D: Keyword.U_SAMPLER3D,
    usamplerCube: Keyword.U_SAMPLER_CUBE,
    usampler2DArray: Keyword.U_SAMPLER2D_ARRAY,
    struct: Keyword.STRUCT,
    void: Keyword.VOID,
    true: Keyword.TRUE,
    false: Keyword.FALSE,
    precision: Keyword.PRECISION,
    precise: Keyword.PRECISE,
    highp: Keyword.HIGHP,
    mediump: Keyword.MEDIUMP,
    lowp: Keyword.LOWP,
    invariant: Keyword.INVARIANT,
    flat: Keyword.FLAT,
    smooth: Keyword.SMOOTH,
    noperspective: Keyword.NOPERSPECTIVE,
    centroid: Keyword.CENTROID,
    layout: Keyword.LAYOUT,
    location: Keyword.LOCATION
  };

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
    const kt = Lexer._lexemeTable[word];
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
