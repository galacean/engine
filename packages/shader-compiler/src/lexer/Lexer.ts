import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, BranchConstraint, BranchSignature, EMPTY_BRANCH, EOF } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { MacroDefineInfo, MacroDefineList } from "../Preprocessor";
import { ShaderCompiler } from "../ShaderCompiler";

/**
 * The Lexer of Shader Compiler
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

  // Groups: 1=name, 2=fn-like params, 3=fn-like value, 4=object-like value.
  // Function-like iff `(` is glued to name (C99 §6.10.3/10, GLSL ES 3.00 §3.4).
  private static readonly _defineDirectiveReg =
    /^\s*#define\s+(\w+)(?:\(([^)]*)\)(?:[ \t]+([^\n\r]*?))?|[ \t]+([^\n\r]*?))?\s*$/;
  // C preprocessor line continuation.
  private static readonly _lineContinuationReg = /\\(?:\r\n|\n|\r)/g;
  // Block / line comments inside a directive slice. The token-stream path
  // strips them via `_skipNonSemantic`, but the regex-based registrar receives
  // a raw `_source.slice(...)` that still contains comment text. Block becomes
  // a single space so adjacent tokens stay separated (`a/**/+/**/b` → `a + b`);
  // line comment is dropped. Required so the dedup key sees the same lexical
  // view the token-stream path emits.
  private static readonly _blockCommentReg = /\/\*[\s\S]*?\*\//g;
  private static readonly _lineCommentReg = /\/\/[^\n\r]*/g;
  // Whitespace collapser for dedup keys: any whitespace run, including the
  // line-continuation we just folded out, becomes a single space.
  private static readonly _whitespaceReg = /\s+/g;
  // Synthetic `__if_<n>` per `#if` — polarity flip makes `#else` mutually exclusive in `isVisibleFrom`.
  private static _ifCounter = 0;

  /** Two branch signatures are equal iff they have the same constraints in the
   *  same order with the same polarity. Used by `#define` dedup and AST upgrade
   *  matching. */
  static sameBranch(a: BranchSignature, b: BranchSignature): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0, n = a.length; i < n; i++) {
      if (a[i].name !== b[i].name || a[i].defined !== b[i].defined) return false;
    }
    return true;
  }

  /**
   * Returns true if a `#define` registered under `defBranch` is reachable from
   * a call site under `callSiteBranch`. Two signatures are mutually exclusive
   * iff some flag appears in both with opposite `defined` polarity. Anything
   * else is compatible — the same flag with the same polarity, or flags that
   * simply don't intersect.
   *
   * Conservative for `#if expr` (not modeled — `tokenize` pushes a sentinel
   * with `name === ""` to keep the `#endif` stack depth correct; that
   * sentinel never matches a real flag in the polarity check below, so it
   * stays visible from everywhere). Exact for the common `#ifdef` /
   * `#ifndef` / `#else` cases that drive real shader code.
   */
  static isVisibleFrom(defBranch: BranchSignature, callSiteBranch: BranchSignature): boolean {
    for (let i = 0, n = defBranch.length; i < n; i++) {
      const d = defBranch[i];
      for (let j = 0, m = callSiteBranch.length; j < m; j++) {
        const c = callSiteBranch[j];
        if (d.name === c.name && d.defined !== c.defined) return false;
      }
    }
    return true;
  }

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

  // Source offset of the current `#define` directive's start (the `#`).
  // Set when `_scanDirectives` consumes `#define`, used by
  // `_registerMacroDefine` at MACRO_DEFINE_END to slice out the directive
  // text and parse it with the same regex the legacy path uses — single
  // source of truth.
  private _macroDefineDirectiveStart: number = -1;

  // Active `#ifdef`/`#ifndef`/`#else` stack. Updated by `tokenize` between
  // emitting tokens; read by `_registerMacroDefine` (when it registers a
  // legacy entry mid-scan) and stamped onto every emitted token's `branch`
  // field so AST nodes know which branch they're inside.
  private _branchStack: BranchConstraint[] = [];
  // True when the previous token was `#ifdef`/`#ifndef` and we're waiting on
  // the next ID token (the flag name) to actually push onto the stack.
  private _pendingBranchPushDefined: boolean | null = null;

  *tokenize() {
    while (!this.isEnd()) {
      const tok = this.scanToken();

      // Resolve a pending #ifdef/#ifndef push using the flag-name token that
      // immediately follows the keyword. Grammar allows the name to be either
      // a plain `id` or a `MACRO_CALL` (for `#ifdef <previously-defined-macro>`).
      if (this._pendingBranchPushDefined !== null && (tok.type === ETokenType.ID || tok.type === Keyword.MACRO_CALL)) {
        this._branchStack.push({ name: tok.lexeme, defined: this._pendingBranchPushDefined });
        this._pendingBranchPushDefined = null;
      }

      // Stamp the branch onto the token only when inside an `#ifdef`. The
      // top-level case keeps the BaseToken default (shared empty signature),
      // so the hot path stays allocation-free.
      if (this._branchStack.length > 0) tok.branch = this._branchStack.slice();

      // Update stack state based on the just-emitted token, so the *next*
      // token sees the correct snapshot. `#if expr` opens a level we can't
      // address (we don't model expressions), but must consume a stack slot
      // so the matching `#endif` pops the right depth — without it, an
      // outer `#ifdef A`'s constraint would be wrongly popped.
      switch (tok.type as Keyword) {
        case Keyword.MACRO_IFDEF:
          this._pendingBranchPushDefined = true;
          break;
        case Keyword.MACRO_IFNDEF:
          this._pendingBranchPushDefined = false;
          break;
        case Keyword.MACRO_IF:
          this._branchStack.push({ name: `__if_${++Lexer._ifCounter}`, defined: true });
          break;
        case Keyword.MACRO_ELIF:
          // Each `#elif` link gets a fresh tag so it's exclusive with earlier arms.
          if (this._branchStack.length > 0) {
            this._branchStack[this._branchStack.length - 1] = {
              name: `__if_${++Lexer._ifCounter}`,
              defined: true
            };
          }
          break;
        case Keyword.MACRO_ELSE: {
          // Flip polarity: `#ifdef X` → `[X=true]` becomes `[X=false]`; `__if_n` likewise.
          const top = this._branchStack[this._branchStack.length - 1];
          if (top) this._branchStack[this._branchStack.length - 1] = { name: top.name, defined: !top.defined };
          break;
        }
        case Keyword.MACRO_ENDIF:
          this._branchStack.pop();
          break;
      }

      yield tok;
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
          token.set(ETokenType.AND_ASSIGN, "&=", start);
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
    const range = ShaderCompiler.createRange(start, this.getShaderPosition());

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
    const src = this._source;
    const len = src.length;
    while (!this.isEnd()) {
      // Honor line-continuation so multi-line directives (`#define X a \\\n + b`)
      // are not cut short at the first physical newline.
      const afterContinuation = Lexer._skipLineContinuation(src, this._currentIndex, len);
      if (afterContinuation !== this._currentIndex) {
        this.advance(afterContinuation - this._currentIndex);
        continue;
      }
      const c = src.charCodeAt(this._currentIndex);
      if (c === 10) break;
      outBuffer.push(src[this._currentIndex]);
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
      // Mark the directive's start offset (the `#`) so the regex-based
      // registrar can later slice out the full directive text from `_source`.
      // Two paths share the same registrar — single source of truth.
      this._macroDefineDirectiveStart = start.index;
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
        // Legacy path: register immediately by parsing the buffered directive.
        this._registerMacroDefine(this._source.slice(this._macroDefineDirectiveStart, this._currentIndex));
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
   * Peek forward from `#define` and decide whether this directive's value
   * should be parsed by the expression grammar (AST path) or kept as an opaque
   * textual token sequence (legacy path).
   *
   * **Routing rule**: route to AST iff the value can be parsed as an
   * `assignment_expression`. The grammar accepts: bare identifiers, numeric /
   * boolean literals, member access (`v.v_uv`), unary / binary operators,
   * parenthesized sub-expressions, function calls.
   *
   * **Stays on legacy path** when the value is *not* a valid expression:
   *   - empty value:                 `#define COMMON_INCLUDED`
   *   - single type/qualifier kw:    `#define FxaaFloat float`
   *   - qualifier list:              `#define HP highp`
   *   - bare punctuation:            `#define COMMA ,`   `#define PAREN (`
   *   - trailing punctuation:        `#define NEG_ONE -1.0,`
   *
   * Why route as much as possible to AST: identifier references in expression
   * values are then a *natural byproduct* of AST analysis (each
   * `VariableIdentifier` semantic-analyzes against the symbol table). This
   * removes the string-based identifier scanner and the entire class of bugs
   * that come with regex-based semantic extraction (comment leaks, missed
   * operators, mis-tokenized parens). Legacy path stays for the GLSL ES 3.00
   * §3.4 "arbitrary token sequence" case — which by construction holds no
   * user identifiers to track.
   *
   * Comment / line-continuation handling is delegated to `_skipNonSemantic`
   * so the peek sees the same lexical view the token-stream path will see.
   */
  private _defineHasValue(): boolean {
    const src = this._source;
    const len = src.length;
    // Skip whitespace / line-continuation / comments before the macro name.
    let i = Lexer._skipNonSemantic(src, this._currentIndex, len);
    // Macro name (required); if absent, malformed → stay legacy.
    if (!(i < len && BaseLexer.isAlpha(src.charCodeAt(i)))) return false;
    while (i < len && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
    // Optional `(params)` directly after the name (no whitespace between name
    // and `(` per C99 §6.10.3/10). If present, skip past the balanced pair.
    // Whitespace between name and `(` makes it object-like → fall through.
    if (i < len && src.charCodeAt(i) === 40 /* '(' */) {
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        i = Lexer._skipNonSemantic(src, i, len);
        if (i >= len) break;
        const c = src.charCodeAt(i);
        if (c === 10 || c === 13) return false; // unbalanced → stay legacy
        if (c === 40) depth++;
        else if (c === 41 /* ')' */) depth--;
        i++;
      }
    }
    // Scan the value. Snapshot the first "real" (non-comment / non-space)
    // character — that anchors empty / starts-with-punctuation detection.
    // Collect a small lookahead window of significant tokens to decide
    // "single type/qualifier keyword" without misclassifying constructor
    // calls (`vec2(...)`) as type aliases.
    i = Lexer._skipNonSemantic(src, i, len);
    if (i >= len || src.charCodeAt(i) === 10 || src.charCodeAt(i) === 13) {
      // Empty value (`#define FOO`) — opaque flag macro, no expression.
      return false;
    }
    const firstChar = src.charCodeAt(i);
    // Leading bare punctuation that can't start an expression (`,`, `;`, `:`,
    // `?`, closing `)`, closing `]`). A leading `(` is fine — it starts a
    // parenthesized expression. A leading `-`/`+`/`!`/`~`/`*`/`&` is fine —
    // they're unary operators (the grammar accepts `-u_unary` etc.).
    if (
      firstChar === 44 /* , */ ||
      firstChar === 59 /* ; */ ||
      firstChar === 58 /* : */ ||
      firstChar === 63 /* ? */ ||
      firstChar === 41 /* ) */ ||
      firstChar === 93 /* ] */
    ) {
      return false;
    }
    // Tokenize the value enough to identify the "single type keyword" shape.
    // Collect the first significant lexeme and check whether anything
    // significant follows on the same logical line.
    let firstLexemeStart = i;
    let firstLexemeEnd = i;
    if (BaseLexer.isAlpha(firstChar)) {
      while (firstLexemeEnd < len && BaseLexer.isAlnum(src.charCodeAt(firstLexemeEnd))) firstLexemeEnd++;
    } else {
      // Non-identifier first lexeme (digit, `(`, unary operator, etc.) —
      // always an expression start. No need to look ahead further.
      return Lexer._scanForUnbalancedTrailing(src, i, len);
    }
    const firstLexeme = src.slice(firstLexemeStart, firstLexemeEnd);
    // Look at what follows the first identifier-shaped lexeme.
    let j = Lexer._skipNonSemantic(src, firstLexemeEnd, len);
    const endsHere = j >= len || src.charCodeAt(j) === 10 || src.charCodeAt(j) === 13;
    if (endsHere) {
      // Single lexeme. If it's a GLSL type/qualifier keyword, the value is a
      // type alias → legacy. Otherwise (bare identifier, like `LIGHT_INPUT
      // u_globalLightDir`), it's a valid `primary_expression` → AST.
      return !Lexer._isNonExpressionLeadingKeyword(firstLexeme);
    }
    const nextChar = src.charCodeAt(j);
    // Constructor call: `vec3(...)` — type keyword followed by `(` is an
    // expression, route to AST. Same for `INVERSE_MAT(mat) inverse(mat)` —
    // identifier followed by `(` is a function call.
    if (nextChar === 40 /* '(' */) {
      return Lexer._scanForUnbalancedTrailing(src, i, len);
    }
    // Multi-token starting with a non-expression keyword (qualifier list like
    // `mediump sampler2D shadowMap`) → legacy.
    if (Lexer._isNonExpressionLeadingKeyword(firstLexeme)) return false;
    // Identifier followed by something other than `(` (operator, dot, etc.) —
    // routes through the trailing-punctuation guard then to AST.
    return Lexer._scanForUnbalancedTrailing(src, i, len);
  }

  /** True for GLSL type / qualifier / non-expression keywords that, when
   *  appearing as the only token of a `#define` value, make the macro a
   *  type-alias-style opaque macro that the expression grammar can't accept. */
  private static _isNonExpressionLeadingKeyword(lexeme: string): boolean {
    const kw = Lexer._lexemeTable[lexeme];
    if (kw === undefined) return false;
    // `true` / `false` are `primary_expression` literals — keep on AST path.
    if (kw === Keyword.True || kw === Keyword.False) return false;
    // Macro directive keywords (`#if`, …) shouldn't appear here anyway, but
    // exclude them defensively.
    if (lexeme.charCodeAt(0) === 35 /* # */) return false;
    return true;
  }

  /** Walks the rest of the directive looking for trailing bare punctuation
   *  (`,`, `;`) at the value's tail — those make the replacement list a
   *  non-expression token sequence and force legacy. Otherwise returns
   *  `true` (route to AST). */
  private static _scanForUnbalancedTrailing(src: string, from: number, len: number): boolean {
    let i = from;
    let lastSignificant = -1;
    let parenDepth = 0;
    while (i < len) {
      const c = src.charCodeAt(i);
      if (c === 10 || c === 13) break;
      const afterSkip = Lexer._skipNonSemantic(src, i, len);
      if (afterSkip !== i) {
        i = afterSkip;
        continue;
      }
      lastSignificant = i;
      if (c === 40 /* ( */) parenDepth++;
      else if (c === 41 /* ) */) parenDepth--;
      i++;
    }
    if (parenDepth !== 0) return false;
    if (lastSignificant === -1) return false;
    const tail = src.charCodeAt(lastSignificant);
    // Trailing `,` or `;` makes the value a non-expression token sequence.
    if (tail === 44 || tail === 59) return false;
    return true;
  }

  /**
   * If `i` points at a `\` immediately followed by a newline (`\n`, `\r`, or
   * `\r\n`), return the index just past the pair (a single atom in the C/GLSL
   * preprocessor view). Otherwise return `i` unchanged. This is the single
   * source of truth for line-continuation detection — callers along the
   * directive-scanning path (`_skipNonSemantic`, `_scanUtilBreakLine`,
   * `_scanMacroDefineParams`) all delegate here so the rule stays in one
   * place. The string-level `_lineContinuationReg` covers the regex path
   * used by `_registerMacroDefine` for one-shot folding.
   */
  private static _skipLineContinuation(src: string, i: number, len: number): number {
    if (src.charCodeAt(i) !== 92 /* '\\' */ || i + 1 >= len) return i;
    const n = src.charCodeAt(i + 1);
    if (n === 10) return i + 2;
    if (n === 13) return i + 2 < len && src.charCodeAt(i + 2) === 10 ? i + 3 : i + 2;
    return i;
  }

  /**
   * Pure positional version of "skip non-semantic characters within a single
   * `#define` directive": spaces, tabs, `\` + newline line-continuation, block
   * comments, line comments. A real `\n` (without preceding `\`) is *not*
   * consumed — it terminates the directive — so callers can detect
   * end-of-directive after this returns. Shared by `_defineHasValue` (peek
   * path) and `_skipInlineSpaceAndComments` (consuming path) so both honor
   * the same lexical view.
   */
  private static _skipNonSemantic(src: string, from: number, len: number): number {
    let i = from;
    while (i < len) {
      const c = src.charCodeAt(i);
      if (c === 32 || c === 9) {
        i++;
        continue;
      }
      const afterContinuation = Lexer._skipLineContinuation(src, i, len);
      if (afterContinuation !== i) {
        i = afterContinuation;
        continue;
      }
      const afterBlock = Lexer._skipBlockComment(src, i, len);
      if (afterBlock !== i) {
        i = afterBlock;
        continue;
      }
      const afterLine = Lexer._skipLineComment(src, i, len);
      if (afterLine !== i) {
        i = afterLine;
        continue;
      }
      break;
    }
    return i;
  }

  /** Consuming wrapper around `_skipNonSemantic` operating on the lexer's
   *  current position. Used by the `#define`-value scan state machine. Goes
   *  through `advance(diff)` so verbose builds keep their line/column counters
   *  in sync (advance walks the consumed slice and bumps `_line` on `\n`). */
  private _skipInlineSpaceAndComments(): void {
    const next = Lexer._skipNonSemantic(this._source, this._currentIndex, this._source.length);
    if (next > this._currentIndex) this.advance(next - this._currentIndex);
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
    const len = src.length;
    const buffer: string[] = [];
    let depth = 0;
    while (this._currentIndex < len) {
      // Honor line-continuation so `#define MAX3( \\\n a, b, c \\\n ) …`
      // collapses onto one logical line. The `\` and `\n` must not enter the
      // params buffer or the grammar will reject the lexeme.
      const afterContinuation = Lexer._skipLineContinuation(src, this._currentIndex, len);
      if (afterContinuation !== this._currentIndex) {
        this.advance(afterContinuation - this._currentIndex);
        continue;
      }
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
    // Register the directive into macroDefineList — single source of truth.
    this._registerMacroDefine(this._source.slice(this._macroDefineDirectiveStart, this._currentIndex));
    this._inMacroDefineValue = false;
    const token = BaseToken.pool.get();
    token.set(Keyword.MACRO_DEFINE_END, "\n", start);
    return token;
  }

  // Parse a `#define <name>[(params)] [value]` directive (already lexed to
  // its newline) and register it. Both AST and legacy paths funnel through
  // here — single source of truth, no drift between two analyzers.
  private _registerMacroDefine(directive: string): void {
    // Normalize the raw directive slice into the same lexical view the
    // token-stream path uses. Two transforms in fixed order:
    //   1. fold `\`+newline line-continuations (C/GLSL preprocessor: the pair
    //      is removed, stitching the next physical line on). The regex's value
    //      group rejects newlines, so without folding any multi-line directive
    //      (`#define X a \\\n + b`) would NO MATCH and registration would
    //      silently fail.
    //   2. strip block / line comments so they don't bleed into `valueRaw` or
    //      mis-tokenize the directive shape. Block becomes a space (preserves
    //      token separation in `a/**/+/**/b`); line comment is dropped.
    // Both transforms produce the directive's "semantically meaningful" text —
    // the same content the token stream sees via `_skipNonSemantic`.
    const folded = directive
      .replace(Lexer._lineContinuationReg, "")
      .replace(Lexer._blockCommentReg, " ")
      .replace(Lexer._lineCommentReg, "");
    const m = Lexer._defineDirectiveReg.exec(folded);
    if (!m) return;
    const name = m[1];
    const paramsStr = m[2];
    const valueRaw = m[3] ?? m[4];
    const params = paramsStr
      ? paramsStr
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    // Dedup key: whitespace-normalized directive text. Two `#define`s with the
    // same name + identical normalized text in the same branch are duplicates
    // (re-includes, multi-chunk repeats). Storing the key once avoids
    // recomputing it on every dedup-list scan.
    const dedupKey = folded.replace(Lexer._whitespaceReg, " ").trim();
    const info: MacroDefineInfo = {
      isFunction: paramsStr !== undefined,
      name,
      params,
      dedupKey,
      branch: this._branchStack.length === 0 ? EMPTY_BRANCH : this._branchStack.slice()
    };
    const arr = this.macroDefineList[name];
    if (!arr) {
      this.macroDefineList[name] = [info];
      return;
    }
    // Skip exact duplicates: same dedup key + same branch. Different branches
    // remain separate entries so `MacroCallSymbol.semanticAnalyze`'s
    // branch-visibility filter can pick the entry that applies at each call
    // site. The legacy "structural equality" check (isFunction + params +
    // referenced identifiers) is subsumed by text equality of the normalized
    // directive — any structural difference produces a different key.
    for (let i = 0, n = arr.length; i < n; i++) {
      const e = arr[i];
      if (e.dedupKey === dedupKey && Lexer.sameBranch(e.branch, info.branch)) return;
    }
    arr.push(info);
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
      // C99 §6.10.3/3: the macro is function-like only when `(` appears *immediately*
      // after the name (no intervening whitespace). `#define FOO (1+2)` is
      // object-like with value `(1+2)`, not a function-like macro `FOO()` with
      // body `1+2`. Check the current char before any whitespace-skipping happens
      // on the next `scanToken`, so a space-separated `(` stays part of the value.
      if (this._inMacroDefineValue) {
        this._macroDefineExpectsParamsToken = this.getCurChar() === "(";
      }
      token.set(ETokenType.ID, word, start);
    } else if (this._isVisibleMacro(word)) {
      token.set(Keyword.MACRO_CALL, word, start);
    } else {
      token.set(kt ?? ETokenType.ID, word, start);
    }
    return token;
  }

  /** True iff at least one `#define <word>` is reachable from the current branch. */
  private _isVisibleMacro(word: string): boolean {
    const defs = this.macroDefineList[word];
    if (!defs || defs.length === 0) return false;
    const callSiteBranch = this._branchStack;
    for (let i = 0, n = defs.length; i < n; i++) {
      if (Lexer.isVisibleFrom(defs[i].branch, callSiteBranch)) return true;
    }
    return false;
  }

  private _scanNum(): BaseToken {
    const buffer: string[] = [];

    // Hex integer literal: `0[xX][0-9a-fA-F]+[uU]?`. Detect before any
    // decimal-digit read so the `x`/`X` after the leading `0` isn't
    // misclassified as an identifier.
    if (this.getCurChar() === "0") {
      const nextCode = this._source.charCodeAt(this._currentIndex + 1);
      if (nextCode === 120 /* 'x' */ || nextCode === 88 /* 'X' */) {
        buffer.push(this.getCurChar());
        this.advance(1);
        buffer.push(this.getCurChar());
        this.advance(1);
        while (BaseLexer.isHexDigit(this.getCurCharCode())) {
          buffer.push(this.getCurChar());
          this.advance(1);
        }
        if (buffer.length === 2) {
          this.throwError(this.getShaderPosition(0), "lexing error, hex literal needs at least one digit.");
        }
        this._scanIntegerSuffix(buffer);

        const token = BaseToken.pool.get();
        token.set(ETokenType.INT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
        return token;
      }
    }

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
    } else if (curChar === "e" || curChar === "E") {
      this._scanFloatSuffix(buffer);

      const token = BaseToken.pool.get();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
      return token;
    } else if (curChar === "f" || curChar === "F") {
      // Pure-integer + `f`/`F` suffix → float (`5f`, `100F`).
      buffer.push(curChar);
      this.advance(1);

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
