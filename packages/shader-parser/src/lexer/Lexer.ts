import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, BranchCondition, BranchConstraint, BranchSignature, EMPTY_BRANCH, EOF } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { MacroDefineInfo, MacroDefineList } from "../Preprocessor";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

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
    mat2x3: Keyword.MAT2X3,
    mat2x4: Keyword.MAT2X4,
    mat3x2: Keyword.MAT3X2,
    mat3x4: Keyword.MAT3X4,
    mat4x2: Keyword.MAT4X2,
    mat4x3: Keyword.MAT4X3,
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
  protected _inMacroDefineValue = false;
  private _macroDefineExpectsNameToken = false;
  private _macroDefineExpectsParamsToken = false;

  // Fields populated as the state machine walks a `#define` directive; consumed
  // by `_emitMacroDefineEnd` to register the directive without re-parsing.
  private _currentMacroName = "";
  private _currentMacroParamsLexeme: string | undefined = undefined;
  private _currentMacroValueStart = -1;

  // Active `#ifdef`/`#ifndef`/`#else` stack. Updated by `tokenize` between
  // emitting tokens; read by `_registerMacroDefine` (when it registers a
  // legacy entry mid-scan) and stamped onto every emitted token's `branch`
  // field so AST nodes know which branch they're inside.
  protected _branchStack: BranchConstraint[] = [];
  private _branchSnapshot: BranchSignature = EMPTY_BRANCH;
  protected _conditionalGroup = 0;
  // True when the previous token was `#ifdef`/`#ifndef` and we're waiting on
  // the next ID token (the flag name) to actually push onto the stack.
  protected _pendingBranchPushDefined: boolean | null = null;
  private _pendingCodegenConditional: "push" | "advance" | null = null;
  private _codegenDefinitelyMatched: boolean[] = [];

  *tokenize() {
    yield* this._tokenizeForCodegen();
    return EOF;
  }

  private *_tokenizeForCodegen() {
    while (!this.isEnd()) {
      const tok = this.scanToken();
      if (this._pendingCodegenConditional && tok.type === Keyword.MACRO_CONDITIONAL_EXPRESSION) {
        const parsedCondition = Lexer._parseCodegenConstantCondition(tok.lexeme);
        if (this._pendingCodegenConditional === "push") {
          const conditionalGroup = ++this._conditionalGroup;
          this._branchStack.push({
            name: `__if_${conditionalGroup}`,
            defined: true,
            conditionalGroup,
            conditionalArm: 0,
            condition: parsedCondition
          });
          this._codegenDefinitelyMatched.push(parsedCondition?.kind === "constant" && parsedCondition.value);
        } else {
          const index = this._branchStack.length - 1;
          const previous = this._branchStack[index];
          if (previous) {
            const definitelyMatched = this._codegenDefinitelyMatched[index];
            const condition = definitelyMatched ? { kind: "constant" as const, value: false } : parsedCondition;
            this._branchStack[index] = {
              name: previous.name,
              defined: true,
              conditionalGroup: previous.conditionalGroup,
              conditionalArm: (previous.conditionalArm ?? 0) + 1,
              condition
            };
            if (!definitelyMatched && parsedCondition?.kind === "constant" && parsedCondition.value) {
              this._codegenDefinitelyMatched[index] = true;
            }
          }
        }
        this._pendingCodegenConditional = null;
      }
      const isMacroName = tok.type === ETokenType.ID || tok.type === Keyword.MACRO_CALL;
      if (this._pendingBranchPushDefined !== null && isMacroName) {
        const conditionalGroup = ++this._conditionalGroup;
        this._branchStack.push({
          name: tok.lexeme,
          defined: this._pendingBranchPushDefined,
          conditionalGroup,
          conditionalArm: 0
        });
        this._codegenDefinitelyMatched.push(false);
        this._pendingBranchPushDefined = null;
      }

      if (this._branchStack.length > 0) tok.branch = this._captureBranchSignature();

      switch (tok.type as Keyword) {
        case Keyword.MACRO_IFDEF:
          this._pendingBranchPushDefined = true;
          break;
        case Keyword.MACRO_IFNDEF:
          this._pendingBranchPushDefined = false;
          break;
        case Keyword.MACRO_IF:
          this._pendingCodegenConditional = "push";
          break;
        case Keyword.MACRO_ELIF:
          this._pendingCodegenConditional = "advance";
          break;
        case Keyword.MACRO_ELSE: {
          const index = this._branchStack.length - 1;
          const previous = this._branchStack[index];
          if (previous) {
            const condition = this._codegenDefinitelyMatched[index]
              ? { kind: "constant" as const, value: false }
              : undefined;
            this._branchStack[index] = {
              name: previous.name,
              defined: tok.type === Keyword.MACRO_ELSE ? !previous.defined : true,
              conditionalGroup: previous.conditionalGroup,
              conditionalArm: (previous.conditionalArm ?? 0) + 1,
              condition
            };
            this._codegenDefinitelyMatched[index] = true;
          }
          break;
        }
        case Keyword.MACRO_ENDIF:
          this._branchStack.pop();
          this._codegenDefinitelyMatched.pop();
          break;
      }

      yield tok;
    }
    return EOF;
  }

  private static _parseCodegenConstantCondition(expression: string): BranchCondition | undefined {
    const source = expression.trim();
    if (!/^[+-]?(?:0[xX][0-9a-fA-F]+|\d+)$/.test(source)) return undefined;
    return { kind: "constant", value: Number(source) !== 0 };
  }

  private static _isCodegenBranchReachable(branch: BranchSignature): boolean {
    for (let i = 0; i < branch.length; i++) {
      const condition = branch[i].condition;
      if (condition?.kind === "constant" && !condition.value) return false;
    }
    return true;
  }

  /** @internal */
  protected _isBranchReachable(branch: BranchSignature): boolean {
    return Lexer._isCodegenBranchReachable(branch);
  }

  /** @internal */
  protected _sameDefinitionBranch(left: BranchSignature, right: BranchSignature): boolean {
    return Lexer._sameCodegenBranch(left, right);
  }

  /** @internal */
  protected _branchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    return Lexer._canCodegenBranchesOverlap(left, right);
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
    const token = new BaseToken();
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
    const range = ShaderCompilerUtils.createRange(start, this.getShaderPosition());

    const token = new BaseToken();
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
    const token = new BaseToken();
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
    const token = new BaseToken();
    const word = buffer.join("");

    if (word === "#define") {
      const branchReachable = this._isBranchReachable(this._branchStack);
      if (!branchReachable) {
        // GLSL preprocessors ignore replacement-list syntax in a statically inactive arm.
        // Keep the original directive for downstream preprocessing without registering or parsing it.
        this._scanUtilBreakLine(buffer);
        token.set(Keyword.MACRO_DEFINE_EXPRESSION, "\n" + buffer.join("") + "\n", start);
        return token;
      }
      const peek = this._peekMacroDefine();
      if (peek && peek.isExpression) {
        // AST path: the value will be tokenized by the lexer's `_inMacroDefineValue`
        // state machine and re-parsed by the expression grammar. State machine
        // fills `_currentMacroName` / `_currentMacroParamsLexeme` / `_currentMacroValueStart`
        // as it walks the value; `_emitMacroDefineEnd` consumes them.
        this._inMacroDefineValue = true;
        // The next word is the macro name: force ID type even if a prior `#define`
        // has already registered the name into `macroDefineList` (redefinition or
        // multi-chunk include), which would otherwise make the word a MACRO_CALL.
        this._macroDefineExpectsNameToken = true;
        token.set(Keyword.MACRO_DEFINE, "#define", start);
      } else {
        // Legacy path: opaque token sequence. Register directly from the peek
        // result without re-walking the directive.
        this._scanUtilBreakLine(buffer);
        const lexeme = "\n" + buffer.join("") + "\n";
        if (peek) {
          this._registerMacroDefine(peek.name, peek.paramsLexeme, peek.valueStart, peek.valueEnd);
        }
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
   * Walk a `#define` directive head once and produce everything both routing
   * and registration need: name range, optional params range, value range,
   * and whether the value parses as an `expression`.
   *
   * The replacement list is split into two paths:
   *
   *  - **AST path** (`isExpression = true`): value parses as `expression`.
   *    Covers identifiers, literals, parenthesized sub-expressions, operator
   *    expressions, function calls, top-level comma lists (per C99 §6.10.3).
   *
   *  - **Opaque path** (`isExpression = false`): every replacement list that
   *    cannot safely enter the expression grammar. Preprocessor replacement
   *    lists are token sequences, not GLSL expressions; fragments such as
   *    `#define ADD +` or `#define OPEN (` are valid and must be preserved.
   *
   * Returns `null` if the directive is malformed before the name. `cursor` is
   * the position past the last non-newline char (caller advances from there).
   */
  private _peekMacroDefine(): {
    name: string;
    paramsLexeme: string | undefined;
    valueStart: number;
    valueEnd: number;
    cursor: number;
    isExpression: boolean;
  } | null {
    const src = this._source;
    const len = src.length;
    let i = Lexer._skipNonSemantic(src, this._currentIndex, len);
    if (!(i < len && BaseLexer.isAlpha(src.charCodeAt(i)))) return null;
    const nameStart = i;
    while (i < len && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
    const name = src.slice(nameStart, i);
    // Optional `(params)` glued to the name (function-like per C99 §6.10.3/10;
    // whitespace before `(` makes it object-like — `(` becomes part of value).
    let paramsLexeme: string | undefined;
    if (i < len && src.charCodeAt(i) === 40 /* '(' */) {
      const paramsStart = i;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        i = Lexer._skipNonSemantic(src, i, len);
        if (i >= len) break;
        const c = src.charCodeAt(i);
        if (c === 10 || c === 13) {
          // Unbalanced before newline — treat as malformed function-like.
          return { name, paramsLexeme: undefined, valueStart: i, valueEnd: i, cursor: i, isExpression: false };
        }
        if (c === 40) depth++;
        else if (c === 41 /* ')' */) depth--;
        i++;
      }
      paramsLexeme = src.slice(paramsStart, i);
    }
    // Walk the value once tracking what routing needs.
    const valueStart = i;
    let parenDepth = 0;
    let bracketDepth = 0;
    let firstStart = -1;
    let firstEnd = -1;
    let firstFollowedByParen = false;
    let topLevelLast = -1;
    while (i < len) {
      const skipped = Lexer._skipNonSemantic(src, i, len);
      if (skipped !== i) {
        i = skipped;
        continue;
      }
      const c = src.charCodeAt(i);
      if (c === 10 || c === 13) break;
      if (firstStart === -1) {
        firstStart = i;
        if (BaseLexer.isAlpha(c)) {
          while (i < len && BaseLexer.isAlnum(src.charCodeAt(i))) i++;
          firstEnd = i;
          const after = Lexer._skipNonSemantic(src, i, len);
          firstFollowedByParen = after < len && src.charCodeAt(after) === 40;
          topLevelLast = firstEnd - 1;
          continue;
        }
      }
      if (c === 40) parenDepth++;
      else if (c === 41) parenDepth--;
      else if (c === 91 /* [ */) bracketDepth++;
      else if (c === 93 /* ] */) bracketDepth--;
      if (parenDepth === 0 && bracketDepth === 0) topLevelLast = i;
      i++;
    }
    const result = { name, paramsLexeme, valueStart, valueEnd: i, cursor: i, isExpression: false };
    // Empty and declaration-oriented replacement lists stay opaque.
    if (firstStart === -1) return result;
    if (
      firstEnd !== -1 &&
      !firstFollowedByParen &&
      Lexer._isNonExpressionLeadingKeyword(src.slice(firstStart, firstEnd))
    ) {
      return result;
    }
    // Legal expression starts: alnum (identifier / literal), `(` (group),
    // `.` (GLSL ES §4.1.4 leading-dot float literal like `.5`), `-`/`+`/`!`/`~`
    // (unary). Legal expression ends: alnum (identifier / literal), `)` (group
    // close), `]` (array-index close). Everything else at the head or
    // top-level tail is an authoring error.
    const head = src.charCodeAt(firstStart);
    const tail = topLevelLast >= 0 ? src.charCodeAt(topLevelLast) : 0;
    const headIllegal =
      !BaseLexer.isAlnum(head) &&
      head !== 40 /* ( */ &&
      head !== 46 /* . */ &&
      head !== 45 /* - */ &&
      head !== 43 /* + */ &&
      head !== 33 /* ! */ &&
      head !== 126; /* ~ */
    const tailIllegal = !BaseLexer.isAlnum(tail) && tail !== 41 /* ) */ && tail !== 93; /* ] */
    if (parenDepth !== 0 || bracketDepth !== 0 || headIllegal || tailIllegal) return result;
    result.isExpression = true;
    return result;
  }

  /** GLSL type / qualifier keywords that aren't expression starters when standing alone.
   *  `true` / `false` are excluded — they're `primary_expression` literals.
   *  `#`-prefixed entries are excluded — they're preprocessor directive names. */
  private static _isNonExpressionLeadingKeyword(lexeme: string): boolean {
    const kw = Lexer._lexemeTable[lexeme];
    return kw !== undefined && kw !== Keyword.True && kw !== Keyword.False && !lexeme.startsWith("#");
  }

  /**
   * If `i` points at a `\` immediately followed by a newline (`\n`, `\r`, or
   * `\r\n`), return the index just past the pair (a single atom in the C/GLSL
   * preprocessor view). Otherwise return `i` unchanged. This is the single
   * source of truth for line-continuation detection — callers along the
   * directive-scanning path (`_skipNonSemantic`, `_scanUtilBreakLine`,
   * `_scanMacroDefineParams`) all delegate here so the rule stays in one
   * place.
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
   *  through `advance(diff)` to keep the line/column counters in sync
   *  (advance walks the consumed slice and bumps `_line` on `\n`). */
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
    const token = new BaseToken();
    const lexeme = buffer.join("");
    this._currentMacroParamsLexeme = lexeme;
    // Value starts after the `)` we just consumed.
    this._currentMacroValueStart = this._currentIndex;
    token.set(Keyword.MACRO_DEFINE_PARAMS, lexeme, start);
    return token;
  }

  /** Emit `MACRO_DEFINE_END` at the end of a `#define` value, consuming the newline. */
  private _emitMacroDefineEnd(): BaseToken {
    const start = this.getShaderPosition();
    const valueEnd = this._currentIndex;
    const source = this._source;
    if (this._currentIndex < source.length) {
      const c = source.charCodeAt(this._currentIndex);
      if (c === 13 && source.charCodeAt(this._currentIndex + 1) === 10) {
        this.advance(2);
      } else if (c === 10 || c === 13) {
        this.advance(1);
      }
    }
    this._registerMacroDefine(
      this._currentMacroName,
      this._currentMacroParamsLexeme,
      this._currentMacroValueStart,
      valueEnd
    );
    this._inMacroDefineValue = false;
    const token = new BaseToken();
    token.set(Keyword.MACRO_DEFINE_END, "\n", start);
    return token;
  }

  // Register a `#define` directive. Both AST and legacy paths funnel through
  // here using ranges already extracted by `_peekMacroDefine` / the value
  // state machine — no re-parsing the directive text.
  protected _registerMacroDefine(
    name: string,
    paramsLexeme: string | undefined,
    valueStart: number,
    valueEnd: number
  ): void {
    const params = paramsLexeme
      ? paramsLexeme
          .slice(1, -1) // strip enclosing `(` `)`
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    // Dedup key: normalized value text (same lexical view the token-stream
    // path sees — comments stripped, whitespace collapsed). Two `#define`s
    // with the same name but different value text produce different keys,
    // so disjoint-branch entries stay separate.
    const dedupKey = `${paramsLexeme ?? ""}=${Lexer._normalizeValueText(this._source, valueStart, valueEnd)}`;
    const info: MacroDefineInfo = {
      isFunction: paramsLexeme !== undefined,
      params,
      dedupKey,
      branch: this._captureBranchSignature()
    };
    const arr = this.macroDefineList[name];
    if (!arr) {
      this.macroDefineList[name] = [info];
    } else {
      // Same key + same branch → duplicate (re-include). Different branches stay
      // separate so the visibility filter picks the right entry at each call site.
      let duplicate = false;
      for (let i = 0, n = arr.length; i < n; i++) {
        const e = arr[i];
        if (e.dedupKey === dedupKey && this._sameDefinitionBranch(e.branch, info.branch)) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) arr.push(info);
    }
  }

  protected _captureBranchSignature(): BranchSignature {
    const stack = this._branchStack;
    const snapshot = this._branchSnapshot;
    if (stack.length === snapshot.length) {
      let unchanged = true;
      for (let i = 0; i < stack.length; i++) {
        if (stack[i] !== snapshot[i]) {
          unchanged = false;
          break;
        }
      }
      if (unchanged) return snapshot;
    }

    return (this._branchSnapshot = stack.length === 0 ? EMPTY_BRANCH : stack.slice());
  }

  /** Render a `[start, end)` value range as space-separated significant chars,
   *  using the same comment / line-continuation rules `_skipNonSemantic`
   *  applies on the token-stream path. Used as the dedup key body. */
  protected static _normalizeValueText(src: string, start: number, end: number): string {
    let out = "";
    let i = start;
    let pendingSpace = false;
    while (i < end) {
      const skipped = Lexer._skipNonSemantic(src, i, end);
      if (skipped !== i) {
        pendingSpace = out.length > 0;
        i = skipped;
        continue;
      }
      const c = src.charCodeAt(i);
      if (c === 32 || c === 9) {
        pendingSpace = out.length > 0;
        i++;
        continue;
      }
      if (pendingSpace) {
        out += " ";
        pendingSpace = false;
      }
      out += src[i];
      i++;
    }
    return out;
  }

  private _scanMacroConditionExpression(): BaseToken {
    const buffer = new Array<string>();
    const start = this.getShaderPosition();
    this._scanUtilBreakLine(buffer);
    const word = buffer.join("");
    const token = new BaseToken();
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
    const token = new BaseToken();
    const word = buffer.join("");
    const kt = Lexer._lexemeTable[word];

    if (this._macroDefineExpectsNameToken) {
      // Bypass MACRO_CALL classification for this one word. Used for the name of
      // a `#define` directive so redefining a known macro still yields a declarer ID.
      this._macroDefineExpectsNameToken = false;
      this._currentMacroName = word;
      this._currentMacroParamsLexeme = undefined;
      // C99 §6.10.3/3: the macro is function-like only when `(` appears *immediately*
      // after the name (no intervening whitespace). `#define FOO (1+2)` is
      // object-like with value `(1+2)`, not a function-like macro `FOO()` with
      // body `1+2`. Check the current char before any whitespace-skipping happens
      // on the next `scanToken`, so a space-separated `(` stays part of the value.
      if (this._inMacroDefineValue) {
        this._macroDefineExpectsParamsToken = this.getCurChar() === "(";
        // For object-like macros, the value begins where the cursor is now
        // (after the name, before whitespace skipping). Function-like macros
        // overwrite this in `_scanMacroDefineParams` after capturing `(...)`.
        this._currentMacroValueStart = this._currentIndex;
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
      if (this._branchesOverlap(defs[i].branch, callSiteBranch)) {
        return true;
      }
    }
    return false;
  }

  private static _sameCodegenBranch(left: BranchSignature, right: BranchSignature): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].name !== right[i].name || left[i].defined !== right[i].defined) return false;
    }
    return true;
  }

  private static _canCodegenBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    for (let i = 0; i < left.length; i++) {
      const leftConstraint = left[i];
      for (let j = 0; j < right.length; j++) {
        const rightConstraint = right[j];
        if (
          (leftConstraint.conditionalGroup !== undefined &&
            leftConstraint.conditionalGroup === rightConstraint.conditionalGroup &&
            leftConstraint.conditionalArm !== rightConstraint.conditionalArm) ||
          (leftConstraint.name === rightConstraint.name && leftConstraint.defined !== rightConstraint.defined)
        ) {
          return false;
        }
      }
    }
    return true;
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

        const token = new BaseToken();
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

      const token = new BaseToken();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
      return token;
    } else if (curChar === "e" || curChar === "E") {
      this._scanFloatSuffix(buffer);

      const token = new BaseToken();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
      return token;
    } else if (curChar === "f" || curChar === "F") {
      // Pure-integer + `f`/`F` suffix → float (`5f`, `100F`).
      buffer.push(curChar);
      this.advance(1);

      const token = new BaseToken();
      token.set(ETokenType.FLOAT_CONSTANT, buffer.join(""), this.getShaderPosition(buffer.length));
      return token;
    } else {
      this._scanIntegerSuffix(buffer);

      const token = new BaseToken();
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
