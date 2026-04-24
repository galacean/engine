import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, EOF } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { MacroDefineList } from "../Preprocessor";
import { ShaderLab } from "../ShaderLab";

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
    true: Keyword.True,
    false: Keyword.False,
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
    location: Keyword.LOCATION,

    // Macros ...
    "#if": Keyword.MACRO_IF,
    "#ifdef": Keyword.MACRO_IFDEF,
    "#ifndef": Keyword.MACRO_IFNDEF,
    "#else": Keyword.MACRO_ELSE,
    "#elif": Keyword.MACRO_ELIF,
    "#endif": Keyword.MACRO_ENDIF,
    "#undef": Keyword.MACRO_UNDEF
  };

  private _needScanMacroConditionExpression = false;

  // --- `#define` scanning state machine ---
  // Expression-style `#define` produces a token stream:
  //     MACRO_DEFINE, ID(name), [MACRO_DEFINE_PARAMS], <value tokens>, MACRO_DEFINE_END
  // The three flags below encode the mini state machine driving that stream:
  //   - _inMacroDefineValue  : persistent mode — newline terminates the directive
  //                            rather than being skipped as whitespace
  //   - _macroDefineExpectsNameToken : one-shot — next identifier is the macro
  //                            name and must be ID (not MACRO_CALL even if the
  //                            name was registered by a prior definition)
  //   - _macroDefineExpectsParamsToken : one-shot — if next char is `(`, capture
  //                            the balanced `(…)` block as a single opaque token
  //                            so the CFG doesn't need its own parameter-list
  //                            non-terminal (which would conflict with
  //                            function_call_parameter_list under LALR(1))
  private _inMacroDefineValue = false;
  private _macroDefineExpectsNameToken = false;
  private _macroDefineExpectsParamsToken = false;

  *tokenize() {
    while (!this.isEnd()) {
      yield this.scanToken();
    }
    return EOF;
  }

  constructor(
    source: string,
    public macroDefineList: MacroDefineList
  ) {
    super(source);
  }

  override scanToken(): BaseToken {
    if (this._inMacroDefineValue) {
      // Inside a `#define` value: newline ends the directive. Skip only spaces/tabs
      // and block comments, never \n, so the termination can be detected.
      this._skipInlineSpaceAndComments();
      if (this.isEnd() || this._isAtLineBreak()) {
        return this._emitMacroDefineEnd();
      }
      // Right after the macro name, if the next char is `(`, capture the whole
      // parenthesized parameter list as one opaque token. This keeps the
      // macro-define grammar LALR(1)-friendly (no nested param-list non-terminal).
      if (this._macroDefineExpectsParamsToken) {
        this._macroDefineExpectsParamsToken = false;
        if (this.getCurChar() === "(") {
          return this._scanMacroDefineParams();
        }
      }
    } else {
      this.skipCommentsAndSpace();
      if (this.isEnd()) {
        return EOF;
      }
    }

    if (this._needScanMacroConditionExpression) {
      this._needScanMacroConditionExpression = false;
      return this._scanMacroConditionExpression();
    }

    const curCharCode = this.getCurCharCode();
    if (BaseLexer.isPreprocessorStartChar(curCharCode)) {
      return this._scanDirectives();
    }
    if (BaseLexer.isAlpha(curCharCode)) {
      return this._scanWord();
    }
    if (BaseLexer.isDigit(curCharCode)) {
      return this._scanNum();
    }

    const start = this.getShaderPosition();
    const token = BaseToken.pool.get();
    let curChar: string;

    switch (this.getCurChar()) {
      case "<":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "<") {
          this.advance(1);
          if (this.getCurChar() === "=") {
            this.advance(1);
            token.set(ETokenType.LEFT_ASSIGN, "<<=", start);
            break;
          }
          token.set(ETokenType.LEFT_OP, "<<", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.LE_OP, "<=", start);
          break;
        }
        token.set(ETokenType.LEFT_ANGLE, "<", start);
        break;

      case ">":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === ">") {
          this.advance(1);
          if (this.getCurChar() === "=") {
            this.advance(1);
            token.set(ETokenType.RIGHT_ASSIGN, ">>=", start);
            break;
          }
          token.set(ETokenType.RIGHT_OP, ">>", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.GE_OP, ">=", start);
          break;
        }
        token.set(ETokenType.RIGHT_ANGLE, ">", start);
        break;

      case "+":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "+") {
          this.advance(1);
          token.set(ETokenType.INC_OP, "++", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.ADD_ASSIGN, "+=", start);
          break;
        }
        token.set(ETokenType.PLUS, "+", start);
        break;

      case "-":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "-") {
          this.advance(1);
          token.set(ETokenType.DEC_OP, "--", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.SUB_ASSIGN, "-=", start);
          break;
        }
        token.set(ETokenType.DASH, "-", start);
        break;

      case "=":
        this.advance(1);
        if (this.getCurChar() === "=") {
          this.advance(1);
          token.set(ETokenType.EQ_OP, "==", start);
          break;
        }
        token.set(ETokenType.EQUAL, "=", start);
        break;

      case "!":
        this.advance(1);
        if (this.getCurChar() === "=") {
          this.advance(1);
          token.set(ETokenType.NE_OP, "!=", start);
          break;
        }
        token.set(ETokenType.BANG, "!", start);
        break;

      case "&":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "&") {
          this.advance(1);
          token.set(ETokenType.AND_OP, "&&", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.ADD_ASSIGN, "&=", start);
          break;
        }
        token.set(ETokenType.AMPERSAND, "&", start);
        break;

      case "|":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "|") {
          this.advance(1);
          token.set(ETokenType.OR_OP, "||", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.OR_ASSIGN, "|=", start);
          break;
        }
        token.set(ETokenType.VERTICAL_BAR, "|", start);
        break;

      case "^":
        this.advance(1);
        curChar = this.getCurChar();
        if (curChar === "^") {
          this.advance(1);
          token.set(ETokenType.XOR_OP, "^^", start);
          break;
        } else if (curChar === "=") {
          this.advance(1);
          token.set(ETokenType.XOR_ASSIGN, "^=", start);
          break;
        }
        token.set(ETokenType.CARET, "^", start);
        break;

      case "*":
        this.advance(1);
        if (this.getCurChar() === "=") {
          this.advance(1);
          token.set(ETokenType.MUL_ASSIGN, "*=", start);
          break;
        }

        token.set(ETokenType.STAR, "*", start);
        break;

      case "/":
        this.advance(1);
        if (this.getCurChar() === "=") {
          this.advance(1);

          token.set(ETokenType.DIV_ASSIGN, "/=", start);
          break;
        }

        token.set(ETokenType.SLASH, "/", start);
        break;

      case "%":
        this.advance(1);
        if (this.getCurChar() === "=") {
          this.advance(1);

          token.set(ETokenType.MOD_ASSIGN, "%=", start);
          break;
        }

        token.set(ETokenType.PERCENT, "%", start);
        break;

      case "(":
        this.advance(1);

        token.set(ETokenType.LEFT_PAREN, "(", start);
        break;
      case ")":
        this.advance(1);

        token.set(ETokenType.RIGHT_PAREN, ")", start);
        break;
      case "{":
        this.advance(1);

        token.set(ETokenType.LEFT_BRACE, "{", start);
        break;
      case "}":
        this.advance(1);

        token.set(ETokenType.RIGHT_BRACE, "}", start);
        break;
      case "[":
        this.advance(1);

        token.set(ETokenType.LEFT_BRACKET, "[", start);
        break;
      case "]":
        this.advance(1);

        token.set(ETokenType.RIGHT_BRACKET, "]", start);
        break;
      case ".":
        this.advance(1);
        if (BaseLexer.isDigit(this.getCurCharCode())) {
          return this._scanNumAfterDot();
        }

        token.set(ETokenType.DOT, ".", start);
        break;
      case ",":
        this.advance(1);

        token.set(ETokenType.COMMA, ",", start);
        break;
      case ":":
        this.advance(1);

        token.set(ETokenType.COLON, ":", start);
        return token;
      case ";":
        this.advance(1);

        token.set(ETokenType.SEMICOLON, ";", start);
        break;
      case "~":
        this.advance(1);

        token.set(ETokenType.TILDE, "~", start);
        break;
      case "?":
        this.advance(1);

        token.set(ETokenType.QUESTION, "?", start);
        break;
      case '"':
        this.advance(1);
        return this._scanStringConst();

      default:
        this.throwError(this.getShaderPosition(0), `Unexpected character ${this.getCurChar()}`);
    }
    return token;
  }

  private _scanStringConst(): BaseToken {
    const start = this.getShaderPosition();
    const buffer: string[] = [];
    while (this.getCurChar() !== '"') {
      buffer.push(this.getCurChar());
      this.advance(1);
    }
    this.advance(1);
    const range = ShaderLab.createRange(start, this.getShaderPosition());

    const token = BaseToken.pool.get();
    token.set(ETokenType.STRING_CONST, buffer.join(""), range);
    return token;
  }

  private _scanNumAfterDot(): BaseToken {
    const buffer = ["."];
    while (BaseLexer.isDigit(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this.advance(1);
    }
    this._scanFloatSuffix(buffer);
    const token = BaseToken.pool.get();
    token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
    return token;
  }

  private _scanUtilBreakLine(outBuffer: string[]): void {
    while (this.getCurChar() !== "\n" && !this.isEnd()) {
      outBuffer.push(this.getCurChar());
      this.advance(1);
    }
  }

  private _scanDirectives(): BaseToken {
    const buffer: string[] = [this.getCurChar()];
    const start = this.getShaderPosition();
    this.advance(1);
    while (BaseLexer.isAlpha(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this.advance(1);
    }
    const token = BaseToken.pool.get();
    const word = buffer.join("");

    if (word === "#define") {
      // Peek the rest of the line: if the directive has no value (`#define X\n`),
      // fall back to the legacy opaque path. Only directives with a non-empty
      // value enter expression-mode (AST parsing).
      if (this._defineHasValue()) {
        this._inMacroDefineValue = true;
        // The next word is the macro name: force ID type even if a prior `#define`
        // has already registered the name into `macroDefineList` (redefinition or
        // multi-chunk include), which would otherwise make the word a MACRO_CALL.
        this._macroDefineExpectsNameToken = true;
        token.set(Keyword.MACRO_DEFINE, "#define", start);
      } else {
        this._scanUtilBreakLine(buffer);
        const lexeme = "\n" + buffer.join("") + "\n";
        token.set(Keyword.MACRO_DEFINE_EXPRESSION, lexeme, start);
      }
    } else {
      const kt = Lexer._lexemeTable[word];
      token.set(kt ?? ETokenType.ID, word, start);
      if (word === "#if" || word === "#elif") {
        this._needScanMacroConditionExpression = true;
      }
    }

    return token;
  }

  /** True if the current char is an unescaped line break (ignoring `\` continuation). */
  private _isAtLineBreak(): boolean {
    const c = this.getCurChar();
    return c === "\n" || c === "\r";
  }

  /**
   * Keywords that CAN legitimately start a GLSL expression — boolean literals and
   * scalar/vector/matrix type constructors. Any other keyword appearing as the
   * first token of a `#define` value means the macro is expanding into a
   * declaration/statement (type alias, qualifier alias, etc.) and must stay on
   * the legacy opaque path.
   *
   * Sampler types and `void` are intentionally excluded (no sampler/void
   * constructor in GLSL ES). Qualifier keywords (`highp`, `in`, `uniform`,
   * `struct`, `const`, `precision`, …) are also excluded — they open
   * declarations, not expressions.
   */
  private static readonly _expressionLeaderKeywords = new Set<Keyword>([
    // Boolean literals
    Keyword.True,
    Keyword.False,
    // Scalar type constructors
    Keyword.BOOL,
    Keyword.INT,
    Keyword.UINT,
    Keyword.FLOAT,
    Keyword.DOUBLE,
    // Vector type constructors
    Keyword.BVEC2,
    Keyword.BVEC3,
    Keyword.BVEC4,
    Keyword.IVEC2,
    Keyword.IVEC3,
    Keyword.IVEC4,
    Keyword.UVEC2,
    Keyword.UVEC3,
    Keyword.UVEC4,
    Keyword.VEC2,
    Keyword.VEC3,
    Keyword.VEC4,
    // Matrix type constructors
    Keyword.MAT2,
    Keyword.MAT3,
    Keyword.MAT4,
    Keyword.MAT2X3,
    Keyword.MAT2X4,
    Keyword.MAT3X2,
    Keyword.MAT3X4,
    Keyword.MAT4X2,
    Keyword.MAT4X3
  ]);

  /**
   * Peek forward from `#define` and decide whether this directive should use the
   * expression-AST path or the legacy opaque path. Returns true for values that
   * can plausibly be parsed as a GLSL expression; returns false for:
   *   - empty bodies (`#define FOO\n`)
   *   - values whose first token is a type/qualifier keyword (the macro is
   *     expanding into a declaration, not an expression)
   *   - values using `\` line continuation (rare; simpler to stay opaque)
   */
  private _defineHasValue(): boolean {
    const src = this._source;
    let i = this._currentIndex;
    // Skip inline whitespace after `#define`
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    // Skip macro name
    if (!(i < src.length && BaseLexer.isAlpha(src.charCodeAt(i)))) return false;
    while (i < src.length && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
    // Optional `(params)`: scan past a balanced pair on the same line
    if (src[i] === "(") {
      let depth = 1;
      i++;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === "\n" || ch === "\r") return false; // malformed: stay legacy
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        i++;
      }
    }
    // Skip trailing whitespace between `)` (or name) and the value
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    if (i >= src.length) return false;
    const ch = src[i];
    if (ch === "\n" || ch === "\r") return false;
    // Line-continuation: `\` + newline — treat as no value for simplicity.
    if (ch === "\\" && (src[i + 1] === "\n" || src[i + 1] === "\r")) return false;

    // Peek the first word of the value. If it's a GLSL keyword that doesn't start
    // expressions (type, qualifier, statement leader), the value isn't
    // expression-shaped — use the legacy path. Non-keyword identifiers and the
    // explicit expression-starter keywords (`true`/`false`) go through the AST path.
    if (BaseLexer.isAlpha(src.charCodeAt(i))) {
      const wordStart = i;
      while (i < src.length && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
      const firstWord = src.substring(wordStart, i);
      const kw = Lexer._lexemeTable[firstWord];
      if (kw !== undefined && !Lexer._expressionLeaderKeywords.has(kw)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Inside a `#define` value, skip spaces/tabs and block comments (`/* … *\/`) but
   * never newlines. Also tolerates line-continuation (`\` immediately before a
   * newline) by skipping the backslash + newline pair per the C preprocessor rule.
   */
  private _skipInlineSpaceAndComments(): void {
    const source = this._source;
    while (this._currentIndex < source.length) {
      const c = source.charCodeAt(this._currentIndex);
      if (c === 32 || c === 9) {
        this.advance(1);
        continue;
      }
      // Line continuation: `\` immediately before newline — consume both.
      if (
        c === 92 && // '\\'
        this._currentIndex + 1 < source.length &&
        (source.charCodeAt(this._currentIndex + 1) === 10 || source.charCodeAt(this._currentIndex + 1) === 13)
      ) {
        this.advance(
          source.charCodeAt(this._currentIndex + 1) === 13 && source.charCodeAt(this._currentIndex + 2) === 10 ? 3 : 2
        );
        continue;
      }
      // Block comment — stays on the same logical line for preprocessor purposes.
      if (
        c === 47 && // '/'
        this._currentIndex + 1 < source.length &&
        source.charCodeAt(this._currentIndex + 1) === 42 // '*'
      ) {
        this.advance(2);
        while (this._currentIndex + 1 < source.length) {
          if (source.charCodeAt(this._currentIndex) === 42 && source.charCodeAt(this._currentIndex + 1) === 47) {
            this.advance(2);
            break;
          }
          this.advance(1);
        }
        continue;
      }
      // Line comment `// …` — consume up to but not including the newline, so the
      // newline still terminates the directive below.
      if (
        c === 47 && // '/'
        this._currentIndex + 1 < source.length &&
        source.charCodeAt(this._currentIndex + 1) === 47
      ) {
        this.advance(2);
        while (
          this._currentIndex < source.length &&
          source.charCodeAt(this._currentIndex) !== 10 &&
          source.charCodeAt(this._currentIndex) !== 13
        ) {
          this.advance(1);
        }
        continue;
      }
      break;
    }
  }

  /**
   * Capture a `(param1, param2, …)` block immediately after the macro name in a
   * `#define` directive, producing a single `MACRO_DEFINE_PARAMS` token whose lexeme
   * is the complete `(…)` text (including parens). Balanced parentheses are honored
   * so the scanner doesn't terminate early on inner `()`. Newlines inside the
   * parameter list are tolerated (rare; appears when the directive uses `\` line
   * continuation), but any newline raises no special error here — it simply stops
   * capture and parser handles the resulting token however it can.
   */
  private _scanMacroDefineParams(): BaseToken {
    const start = this.getShaderPosition();
    const src = this._source;
    const buffer: string[] = [];
    let depth = 0;
    while (this._currentIndex < src.length) {
      const ch = src[this._currentIndex];
      buffer.push(ch);
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        this.advance(1);
        if (depth === 0) break;
        continue;
      }
      this.advance(1);
    }
    const token = BaseToken.pool.get();
    token.set(Keyword.MACRO_DEFINE_PARAMS, buffer.join(""), start);
    return token;
  }

  /** Emit `MACRO_DEFINE_END` at the end of a `#define` value, consuming the newline. */
  private _emitMacroDefineEnd(): BaseToken {
    const start = this.getShaderPosition();
    const source = this._source;
    if (this._currentIndex < source.length) {
      const c = source.charCodeAt(this._currentIndex);
      if (c === 13 && source.charCodeAt(this._currentIndex + 1) === 10) {
        this.advance(2);
      } else if (c === 10 || c === 13) {
        this.advance(1);
      }
    }
    this._inMacroDefineValue = false;
    const token = BaseToken.pool.get();
    token.set(Keyword.MACRO_DEFINE_END, "\n", start);
    return token;
  }

  private _scanMacroConditionExpression(): BaseToken {
    const buffer = new Array<string>();
    const start = this.getShaderPosition();
    this._scanUtilBreakLine(buffer);
    const word = buffer.join("");
    const token = BaseToken.pool.get();
    token.set(Keyword.MACRO_CONDITIONAL_EXPRESSION, word, start);
    return token;
  }

  private _scanWord(): BaseToken {
    const buffer: string[] = [this.getCurChar()];
    const start = this.getShaderPosition();
    this.advance(1);
    while (BaseLexer.isAlnum(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this.advance(1);
    }
    const token = BaseToken.pool.get();
    const word = buffer.join("");
    const kt = Lexer._lexemeTable[word];

    if (this._macroDefineExpectsNameToken) {
      // Bypass MACRO_CALL classification for this one word. Used for the name of
      // a `#define` directive so redefining a known macro still yields a declarer ID.
      this._macroDefineExpectsNameToken = false;
      // If we're inside a `#define` directive, this ID *is* the macro name and the
      // next character, if `(`, begins the parameter list.
      if (this._inMacroDefineValue) this._macroDefineExpectsParamsToken = true;
      token.set(ETokenType.ID, word, start);
    } else if (this.macroDefineList[word]) {
      token.set(Keyword.MACRO_CALL, word, start);
    } else {
      token.set(kt ?? ETokenType.ID, word, start);
    }
    return token;
  }

  private _scanNum(): BaseToken {
    const buffer: string[] = [];
    while (BaseLexer.isDigit(this.getCurCharCode())) {
      buffer.push(this.getCurChar());
      this.advance(1);
    }
    const curChar = this.getCurChar();
    if (curChar === ".") {
      buffer.push(curChar);
      this.advance(1);
      while (BaseLexer.isDigit(this.getCurCharCode())) {
        buffer.push(this.getCurChar());
        this.advance(1);
      }
      this._scanFloatSuffix(buffer);

      const token = BaseToken.pool.get();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
      return token;
    } else {
      if (curChar === "e" || curChar === "E") {
        this._scanFloatSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
        return token;
      } else {
        this._scanIntegerSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.INT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
        return token;
      }
    }
  }

  private _scanFloatSuffix(buffer: string[]): void {
    let curChar = this.getCurChar();
    if (curChar === "e" || curChar === "E") {
      buffer.push(curChar);
      this.advance(1);
      curChar = this.getCurChar();
      if (curChar === "+" || curChar === "-") {
        buffer.push(curChar);
        this.advance(1);
        curChar = this.getCurChar();
      }
      if (!BaseLexer.isDigit(this.getCurCharCode()))
        this.throwError(this.getShaderPosition(0), "lexing error, invalid exponent suffix.");

      do {
        buffer.push(curChar);
        this.advance(1);
        curChar = this.getCurChar();
      } while (BaseLexer.isDigit(this.getCurCharCode()));
    }
    if (curChar === "f" || curChar === "F") {
      buffer.push(curChar);
      this.advance(1);
    }
  }

  private _scanIntegerSuffix(buffer: string[]): void {
    const curChar = this.getCurChar();
    if (curChar === "u" || curChar === "U") {
      buffer.push(curChar);
      this.advance(1);
    }
  }
}
