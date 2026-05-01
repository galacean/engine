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

  // Parses a `#define <name>[(params)] [value]` directive lexeme, sliced from
  // `_source` between the `#` and the directive-terminating newline. Used by
  // `_registerMacroDefine` to feed `macroDefineList` from both the AST and
  // legacy `#define` paths — single source of truth, no drift between two
  // analyzers.
  private static readonly _defineDirectiveReg = /^\s*#define\s+(\w+)[ ]*(\(([^)]*)\))?(?:[ \t]+([^\n\r]*?))?\s*$/;
  // Anchors a `#define` value to a bare identifier or function-call form
  // (`foo` or `foo(a, b)`); mixed-operator values like `a + b` reject. The
  // captured identifier becomes `MacroDefineInfo.referenceName`.
  private static readonly _referenceReg = /^([a-zA-Z_]\w*)(?:\s*\(.*\))?$/;
  // C preprocessor line continuation: `\` followed by `\r\n`, `\n`, or `\r`.
  // The pair is removed (the next physical line is part of the same logical line).
  private static readonly _lineContinuationReg = /\\(?:\r\n|\n|\r)/g;
  // Sentinel pushed onto the branch stack when `#if expr` opens a level we
  // don't model. `name === ""` never matches a real flag in
  // `isVisibleFrom`'s polarity check, so it's conservatively visible
  // everywhere — but it occupies one stack slot so `#endif` pops the right
  // depth. Shared by all `#if` opens to avoid per-token allocation.
  private static readonly _IF_SENTINEL: BranchConstraint = { name: "", defined: true };

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
          this._branchStack.push(Lexer._IF_SENTINEL);
          break;
        case Keyword.MACRO_ELIF:
          // `#elif` ends the previous arm and opens a new one at the same
          // depth. The new arm's actual condition is `(none of the previous
          // arms held) AND <elif expr>`. We don't model expressions, but
          // we *also* must not inherit the previous arm's tag — e.g.
          // `#ifdef A / def X1 / #elif B / def X2 / #endif` would tag X2
          // with `[A=true]`, which is the opposite of where X2 is actually
          // active. Flipping polarity (like `#else` does) only works for
          // the first `#elif` of a chain; longer chains would ping-pong.
          // Degrade to sentinel uniformly: drops precision but never wrong.
          if (this._branchStack.length > 0) {
            this._branchStack[this._branchStack.length - 1] = Lexer._IF_SENTINEL;
          }
          break;
        case Keyword.MACRO_ELSE: {
          // Flip the polarity of the topmost constraint. For `#ifdef X` this
          // turns `[X=true]` into `[X=false]`. For `#if expr` / `#elif`
          // chains the top is the sentinel (`name=""`), and flipping its
          // `defined` is harmless — `isVisibleFrom` ignores empty-name
          // entries.
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

  // Comments are already stripped by Preprocessor, only skip whitespace.
  override skipCommentsAndSpace(): void {
    this.skipSpace(true);
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
   * Peek forward from `#define` and decide whether this directive should use the
   * expression-AST path or the legacy opaque path.
   *
   * The AST path's only purpose is to enable the shader compiler's structural rewrites
   * (varying flatten, struct-property reference tracking) on macro values that
   * mention struct members. Every other shape — bare identifiers, numeric
   * literals, type-alias keywords (`#define FxaaFloat2 vec2`), constructor
   * calls, qualifier fragments, `#define COMMA ,` etc. — is correctly handled
   * by the GLSL driver via textual substitution and needs no AST.
   *
   * So the routing rule is positive and information-driven: **AST iff the
   * replacement list contains a `.` member-access operator**. This is robust
   * against new GLSL keywords / extensions and incidentally moves all simple
   * constants and type aliases off the 18-layer expression precedence chain.
   */
  private _defineHasValue(): boolean {
    const src = this._source;
    const len = src.length;
    // All position advancement goes through `_skipNonSemantic`, which honors
    // line-continuation (`\` + newline) and skips comments. This is critical:
    // `#define UV foo \\\n  .field` is one logical directive whose value
    // contains `.field`, and `#define HP /* a.b */ highp` must not let the
    // `.` inside the comment trigger AST routing.
    let i = Lexer._skipNonSemantic(src, this._currentIndex, len);
    // Skip macro name
    if (!(i < len && BaseLexer.isAlpha(src.charCodeAt(i)))) return false;
    while (i < len && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
    i = Lexer._skipNonSemantic(src, i, len);
    // Optional `(params)`: scan past a balanced pair on the same logical line
    if (src.charCodeAt(i) === 40 /* '(' */) {
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        i = Lexer._skipNonSemantic(src, i, len);
        const c = src.charCodeAt(i);
        if (c === 10 || c === 13) return false; // malformed: stay legacy
        if (c === 40) depth++;
        else if (c === 41 /* ')' */) depth--;
        i++;
      }
    }
    // Scan to end-of-directive looking for a `.` member-access operator.
    // A `.` is member-access unless it's a decimal point inside a numeric
    // literal — the latter has digits on both physical sides (`3.14`).
    // Edge cases like `.5` go AST too (false positive, but AST path
    // handles bare floats correctly).
    while (i < len) {
      i = Lexer._skipNonSemantic(src, i, len);
      if (i >= len) break;
      const c = src.charCodeAt(i);
      if (c === 10 || c === 13) break; // real newline ends directive
      if (c === 46 /* '.' */) {
        const prev = i > 0 ? src.charCodeAt(i - 1) : 0;
        const next = i + 1 < len ? src.charCodeAt(i + 1) : 0;
        const prevIsDigit = prev >= 48 && prev <= 57;
        const nextIsDigit = next >= 48 && next <= 57;
        if (!(prevIsDigit && nextIsDigit)) return true;
      }
      i++;
    }
    return false;
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
    // Fold line-continuations before matching: per C/GLSL preprocessor rules
    // `\` immediately before a newline removes both characters and stitches
    // the next physical line onto this one. The regex's value group rejects
    // newlines, so without folding any multi-line directive (`#define X a \\\n + b`)
    // would NO MATCH and registration would silently fail.
    const folded = directive.replace(Lexer._lineContinuationReg, "");
    const m = Lexer._defineDirectiveReg.exec(folded);
    if (!m) return;
    const name = m[1];
    const paramsStr = m[3];
    const valueRaw = m[4];
    const params = paramsStr
      ? paramsStr
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const refMatch = valueRaw ? Lexer._referenceReg.exec(valueRaw.trim()) : null;
    const info: MacroDefineInfo = {
      isFunction: m[2] !== undefined,
      name,
      params,
      referenceName: refMatch ? refMatch[1] : "",
      branch: this._branchStack.length === 0 ? EMPTY_BRANCH : this._branchStack.slice()
    };
    const arr = this.macroDefineList[name];
    if (!arr) {
      this.macroDefineList[name] = [info];
      return;
    }
    // Skip duplicates from re-includes / re-definitions in the same `#ifdef`
    // branch. Different branches → different entries (the call-site filter
    // picks the visible one); same branch + same shape → drop.
    for (let i = 0, n = arr.length; i < n; i++) {
      const e = arr[i];
      if (
        e.isFunction === info.isFunction &&
        e.referenceName === info.referenceName &&
        e.params.length === info.params.length &&
        e.params.every((p, idx) => p === info.params[idx]) &&
        Lexer.sameBranch(e.branch, info.branch)
      )
        return;
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
