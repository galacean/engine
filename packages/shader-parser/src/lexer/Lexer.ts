import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
// #if _VERBOSE
import { parsePreprocessorCondition, type PreprocessorCondition } from "../common/PreprocessorCondition";
// #endif
import { BaseToken, BranchCondition, BranchConstraint, BranchSignature, EMPTY_BRANCH, EOF } from "../common/BaseToken";
// #if _VERBOSE
import { canBranchesOverlap, isBranchReachable, isConditionalChainExhaustive, sameBranch } from "../common/BaseToken";
// #endif
import { Keyword } from "../common/enums/Keyword";
import { MacroDefineInfo, MacroDefineList } from "../Preprocessor";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

// #if _VERBOSE
interface MacroState {
  defined: boolean | undefined;
  definedCondition: BranchCondition;
  value: number | undefined;
  version: number;
}

type MacroStateMap = Record<string, MacroState>;

interface ConditionalFrame {
  entryState: MacroStateMap;
  armStates: ConditionalArmState[];
  constraints: BranchConstraint[];
  priorConditions: BranchCondition[];
  hasElse: boolean;
  definitelyMatched: boolean;
  mutatedNames: Set<string>;
  guardName?: string;
  guardDefined?: boolean;
  selfGuarding: boolean;
}

interface ConditionalArmState {
  branch: BranchSignature;
  state: MacroStateMap;
}
// #endif

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
  private _inMacroDefineValue = false;
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
  private _branchStack: BranchConstraint[] = [];
  // #if _VERBOSE
  private _conditionalFrames: ConditionalFrame[] = [];
  // #endif
  private _conditionalGroup = 0;
  // #if _VERBOSE
  private _guardUndefBranches: Record<string, BranchSignature[]> = Object.create(null);
  private _macroStates: MacroStateMap = Object.create(null);
  private _macroVersions: Record<string, number> = Object.create(null);
  // #endif
  // True when the previous token was `#ifdef`/`#ifndef` and we're waiting on
  // the next ID token (the flag name) to actually push onto the stack.
  private _pendingBranchPushDefined: boolean | null = null;
  // #if _VERBOSE
  private _pendingGuardUndef = false;
  private _pendingOpaqueConditional: "push" | "advance" | null = null;
  // #endif
  private _pendingCodegenConditional: "push" | "advance" | null = null;
  private _codegenDefinitelyMatched: boolean[] = [];

  *tokenize() {
    // #if _VERBOSE
    if (!this._branchAnalysisEnabled) {
      yield* this._tokenizeForCodegen();
      return EOF;
    }

    yield* this._tokenizeWithBranchAnalysis();
    return EOF;
    // #else
    yield* this._tokenizeForCodegen();
    return EOF;
    // #endif
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

      if (this._branchStack.length > 0) tok.branch = this._branchStack.slice();

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

  // prettier-ignore
  constructor(
    source: string,
    public macroDefineList: MacroDefineList
    // #if _VERBOSE
    , private readonly _branchAnalysisEnabled = false
    // #endif
  ) {
    super(source);
  }

  // #if _VERBOSE
  private *_tokenizeWithBranchAnalysis() {
    while (!this.isEnd()) {
      const tok = this.scanToken();
      tok.inMacroDefinition = this._inMacroDefineValue;

      // Resolve a pending #ifdef/#ifndef push using the flag-name token that
      // immediately follows the keyword. Grammar allows the name to be either
      // a plain `id` or a `MACRO_CALL` when the macro is already defined.
      const isMacroName = tok.type === ETokenType.ID || tok.type === Keyword.MACRO_CALL;
      if (this._pendingBranchPushDefined !== null && isMacroName) {
        const conditionalGroup = ++this._conditionalGroup;
        const guardUndefBranches = this._guardUndefBranches[tok.lexeme] ?? (this._guardUndefBranches[tok.lexeme] = []);
        this._openConditional({
          name: tok.lexeme,
          defined: this._pendingBranchPushDefined,
          conditionalGroup,
          conditionalArm: 0,
          condition: {
            kind: "defined",
            name: tok.lexeme,
            defined: this._pendingBranchPushDefined,
            version: this._macroVersion(tok.lexeme)
          },
          guardUndefBranches: this._pendingBranchPushDefined ? undefined : guardUndefBranches,
          guardUndefStart: this._pendingBranchPushDefined ? undefined : guardUndefBranches.length,
          selfGuarding: false
        });
        this._pendingBranchPushDefined = null;
      }
      if (this._pendingGuardUndef && isMacroName) {
        this._recordGuardUndef(tok.lexeme);
        this._applyMacroUndef(tok.lexeme);
        this._pendingGuardUndef = false;
      }
      if (this._pendingOpaqueConditional && tok.type === Keyword.MACRO_CONDITIONAL_EXPRESSION) {
        const condition = this._parseSimpleCondition(tok.lexeme);
        if (this._pendingOpaqueConditional === "push") this._pushOpaqueConditional(condition);
        else this._advanceOpaqueConditionalArm(condition);
        this._pendingOpaqueConditional = null;
      }

      // Stamp the branch onto the token only when inside an `#ifdef`. The
      // top-level case keeps the BaseToken default (shared empty signature),
      // so the hot path stays allocation-free.
      if (this._branchStack.length > 0) tok.branch = this._branchStack.slice();

      // Update stack state based on the just-emitted token, so the *next*
      // token sees the correct snapshot. `#if expr` opens a level after its
      // expression is scanned so recognized atoms can annotate that arm; every
      // expression still consumes exactly one stack slot for its matching `#endif`.
      switch (tok.type as Keyword) {
        case Keyword.MACRO_IFDEF:
          this._pendingBranchPushDefined = true;
          break;
        case Keyword.MACRO_IFNDEF:
          this._pendingBranchPushDefined = false;
          break;
        case Keyword.MACRO_IF:
          this._pendingOpaqueConditional = "push";
          break;
        case Keyword.MACRO_ELIF:
          this._pendingOpaqueConditional = "advance";
          break;
        case Keyword.MACRO_ELSE: {
          this._advanceElseArm();
          break;
        }
        case Keyword.MACRO_UNDEF:
          this._pendingGuardUndef = true;
          break;
        case Keyword.MACRO_ENDIF:
          this._closeConditional();
          break;
      }

      yield tok;
    }
    return EOF;
  }

  private _pushOpaqueConditional(condition?: BranchCondition): void {
    const conditionalGroup = ++this._conditionalGroup;
    this._openConditional({
      name: `__if_${conditionalGroup}_0`,
      defined: true,
      conditionalGroup,
      conditionalArm: 0,
      condition
    });
  }

  private _advanceOpaqueConditionalArm(condition?: BranchCondition): void {
    const frame = this._conditionalFrames[this._conditionalFrames.length - 1];
    const index = this._branchStack.length - 1;
    const top = this._branchStack[index];
    if (!frame || !top) return;
    this._finishCurrentArm(frame);
    this._macroStates = Lexer._cloneMacroStates(frame.entryState);
    const conditionalArm = (top.conditionalArm ?? 0) + 1;
    const precedingConditions = frame.priorConditions.slice();
    const resolved = this._resolveCondition(condition);
    const armCondition: BranchCondition | undefined = frame.definitelyMatched
      ? { kind: "constant", value: false }
      : resolved;
    if (armCondition?.kind === "constant" && armCondition.value) frame.definitelyMatched = true;
    const nextConstraint: BranchConstraint = {
      name: `__if_${top.conditionalGroup}_${conditionalArm}`,
      defined: true,
      conditionalGroup: top.conditionalGroup,
      conditionalArm,
      condition: armCondition,
      precedingConditions
    };
    this._branchStack[index] = nextConstraint;
    frame.constraints.push(nextConstraint);
    if (resolved) frame.priorConditions.push(Lexer._negateSimpleCondition(resolved)!);
    this._assumeCondition(armCondition);
  }

  private _advanceElseArm(): void {
    const frame = this._conditionalFrames[this._conditionalFrames.length - 1];
    const index = this._branchStack.length - 1;
    const top = this._branchStack[index];
    if (!frame || !top) return;
    this._finishCurrentArm(frame);
    this._macroStates = Lexer._cloneMacroStates(frame.entryState);
    const conditionalArm = (top.conditionalArm ?? 0) + 1;
    const precedingConditions = frame.priorConditions.slice();
    const condition: BranchCondition | undefined = frame.definitelyMatched
      ? { kind: "constant", value: false }
      : undefined;
    for (let i = 0, n = frame.constraints.length; i < n; i++) frame.constraints[i].conditionalComplete = true;
    const nextConstraint: BranchConstraint = {
      name: `__if_${top.conditionalGroup}_${conditionalArm}`,
      defined: true,
      conditionalGroup: top.conditionalGroup,
      conditionalArm,
      condition,
      precedingConditions,
      conditionalComplete: true
    };
    this._branchStack[index] = nextConstraint;
    frame.constraints.push(nextConstraint);
    frame.hasElse = true;
    frame.definitelyMatched = true;
  }

  private _openConditional(constraint: BranchConstraint): void {
    const resolved = this._resolveCondition(constraint.condition);
    const activeConstraint: BranchConstraint = { ...constraint, condition: resolved };
    const frame: ConditionalFrame = {
      entryState: Lexer._cloneMacroStates(this._macroStates),
      armStates: [],
      constraints: [activeConstraint],
      priorConditions: resolved ? [Lexer._negateSimpleCondition(resolved)!] : [],
      hasElse: false,
      definitelyMatched: resolved?.kind === "constant" && resolved.value,
      mutatedNames: new Set(),
      guardName: constraint.guardUndefBranches ? constraint.name : undefined,
      guardDefined: constraint.guardUndefBranches ? constraint.defined : undefined,
      selfGuarding: false
    };
    this._conditionalFrames.push(frame);
    this._branchStack.push(activeConstraint);
    this._assumeCondition(resolved);
  }

  private _closeConditional(): void {
    const frame = this._conditionalFrames.pop();
    const branch = this._branchStack.pop();
    if (!frame || !branch) return;
    this._finishCurrentArm(frame, [...this._branchStack, branch]);
    const conditionalComplete = frame.hasElse || isConditionalChainExhaustive(frame.constraints);
    if (conditionalComplete) {
      const conditionalReachableArms = frame.constraints.map((constraint) => isBranchReachable([constraint]));
      for (let i = 0, n = frame.constraints.length; i < n; i++) {
        frame.constraints[i].conditionalComplete = true;
        frame.constraints[i].conditionalArmCount = n;
        frame.constraints[i].conditionalReachableArms = conditionalReachableArms;
      }
    }
    if (!conditionalComplete) {
      frame.armStates.push({
        branch: [
          ...this._branchStack,
          {
            name: `__if_${branch.conditionalGroup}_implicit`,
            defined: true,
            condition: undefined,
            precedingConditions: frame.priorConditions.slice()
          }
        ],
        state: Lexer._cloneMacroStates(frame.entryState)
      });
    }
    this._macroStates = this._mergeMacroStates(frame);
    if (frame.guardName && frame.guardDefined === false && frame.selfGuarding) {
      this._setMacroState(frame.guardName, true, undefined);
    }
  }

  private _finishCurrentArm(frame: ConditionalFrame, branch = this._branchStack): void {
    if (isBranchReachable(branch)) {
      frame.armStates.push({ branch: branch.slice(), state: Lexer._cloneMacroStates(this._macroStates) });
    }
  }

  private _mergeMacroStates(frame: ConditionalFrame): MacroStateMap {
    const merged = Lexer._cloneMacroStates(frame.entryState);
    for (const name of frame.mutatedNames) {
      const first = frame.armStates[0]?.state[name] ?? frame.entryState[name] ?? this._defaultMacroState(name);
      let matches = true;
      for (let i = 1, n = frame.armStates.length; i < n; i++) {
        const candidate = frame.armStates[i].state[name] ?? frame.entryState[name] ?? this._defaultMacroState(name);
        if (!Lexer._sameMacroState(first, candidate)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        merged[name] = { ...first };
      } else {
        const definitionConditions: BranchCondition[] = [];
        for (let i = 0, n = frame.armStates.length; i < n; i++) {
          const arm = frame.armStates[i];
          const state = arm.state[name] ?? frame.entryState[name] ?? this._defaultMacroState(name);
          definitionConditions.push(
            Lexer._combineConditions("&&", [this._branchCondition(arm.branch), state.definedCondition])
          );
        }
        merged[name] = {
          defined: undefined,
          definedCondition: Lexer._combineConditions("||", definitionConditions),
          value: undefined,
          version: this._nextMacroVersion(name)
        };
      }
    }
    return merged;
  }

  private _resolveCondition(condition?: BranchCondition): BranchCondition | undefined {
    if (!condition || condition.kind === "constant") return condition;
    const bound = this._bindCondition(condition);
    const value = this._evaluateCondition(bound);
    if (value !== undefined) return { kind: "constant", value };
    return this._expandDefinedMacroConditions(bound);
  }

  private _expandDefinedMacroConditions(condition: BranchCondition): BranchCondition {
    if (condition.kind === "defined") return this._resolveDefinedMacroCondition(condition);
    if (condition.kind !== "expression") return condition;
    if (condition.opaque) return condition;
    const expanded = Lexer._combineConditions(
      condition.operator,
      condition.operands.map((operand) => this._expandDefinedMacroConditions(operand))
    );
    return condition.negated ? Lexer._negateSimpleCondition(expanded)! : expanded;
  }

  /** Resolve a macro test from the symbolic state produced by preceding define and undef directives. */
  private _resolveDefinedMacroCondition(condition: Extract<BranchCondition, { kind: "defined" }>): BranchCondition {
    let macroDefined = this._macroState(condition.name).definedCondition;
    const definitions = this.macroDefineList[condition.name];
    if (
      definitions?.some(
        (definition) =>
          !definition.branch.some((constraint) => constraint.name === condition.name && constraint.selfGuarding)
      )
    ) {
      macroDefined = Lexer._substituteExternalMacroState(macroDefined, condition.name);
    }
    return condition.defined ? macroDefined : Lexer._negateSimpleCondition(macroDefined)!;
  }

  private _branchCondition(branch: BranchSignature): BranchCondition {
    const conditions: BranchCondition[] = [];
    for (let i = 0, n = branch.length; i < n; i++) {
      const constraint = branch[i];
      if (constraint.selfGuarding) continue;
      if (constraint.precedingConditions) conditions.push(...constraint.precedingConditions);
      if (constraint.condition) conditions.push(constraint.condition);
    }
    return Lexer._combineConditions("&&", conditions);
  }

  private _bindCondition(condition: Exclude<BranchCondition, { kind: "constant" }>): BranchCondition {
    if (condition.kind === "expression") {
      return {
        ...condition,
        operands: condition.operands.map((operand) =>
          operand.kind === "constant" ? operand : this._bindCondition(operand)
        ),
        versions: condition.names.map((name) => this._macroVersion(name))
      };
    }
    return { ...condition, version: this._macroVersion(condition.name) };
  }

  private _evaluateCondition(condition: BranchCondition): boolean | undefined {
    if (condition.kind === "constant") return condition.value;
    if (condition.kind === "expression") {
      if (condition.opaque) return undefined;
      const values = condition.operands.map((operand) => this._evaluateCondition(operand));
      let value: boolean | undefined;
      if (condition.operator === "&&") {
        value = values.some((candidate) => candidate === false)
          ? false
          : values.every((candidate) => candidate === true)
            ? true
            : undefined;
      } else {
        value = values.some((candidate) => candidate === true)
          ? true
          : values.every((candidate) => candidate === false)
            ? false
            : undefined;
      }
      return value === undefined ? undefined : condition.negated ? !value : value;
    }
    const state = this._macroState(condition.name);
    if (condition.kind === "defined") {
      return state.defined === undefined ? undefined : state.defined === condition.defined;
    }
    if (state.value !== undefined) return Lexer._matchesComparison(state.value, condition);
    if (state.defined === false) return Lexer._matchesComparison(0, condition);
    return undefined;
  }

  private _assumeCondition(condition?: BranchCondition): void {
    if (!condition || condition.kind === "constant") return;
    if (condition.kind === "expression") return;
    const current = this._macroState(condition.name);
    if (condition.kind === "defined") {
      this._macroStates[condition.name] = {
        defined: condition.defined,
        definedCondition: { kind: "constant", value: condition.defined },
        value: condition.defined ? current.value : 0,
        version: current.version
      };
      return;
    }
    if (condition.operator === "==") {
      this._macroStates[condition.name] = {
        defined: true,
        definedCondition: { kind: "constant", value: true },
        value: condition.value,
        version: current.version
      };
    } else if (condition.operator === "!=" && condition.value === 0) {
      this._macroStates[condition.name] = {
        defined: true,
        definedCondition: { kind: "constant", value: true },
        value: current.value,
        version: current.version
      };
    }
  }

  private _applyMacroUndef(name: string): void {
    if (!isBranchReachable(this._branchStack)) return;
    this._markMacroMutation(name);
    this._setMacroState(name, false, 0);
  }

  private _applyMacroDefine(
    name: string,
    paramsLexeme: string | undefined,
    valueStart: number,
    valueEnd: number
  ): void {
    if (!isBranchReachable(this._branchStack)) return;
    this._markMacroMutation(name);
    const value =
      paramsLexeme === undefined
        ? Lexer._parseNumericLiteral(Lexer._normalizeValueText(this._source, valueStart, valueEnd))
        : undefined;
    this._setMacroState(name, true, value);
  }

  private _markMacroMutation(name: string): void {
    const state = this._macroState(name);
    for (let i = 0, n = this._conditionalFrames.length; i < n; i++) {
      const frame = this._conditionalFrames[i];
      if (!frame.entryState[name]) frame.entryState[name] = { ...state };
      frame.mutatedNames.add(name);
    }
  }

  private _setMacroState(name: string, defined: boolean, value: number | undefined): void {
    this._macroStates[name] = {
      defined,
      definedCondition: { kind: "constant", value: defined },
      value,
      version: this._nextMacroVersion(name)
    };
  }

  private _macroState(name: string): MacroState {
    return this._macroStates[name] ?? this._defaultMacroState(name);
  }

  private _defaultMacroState(name: string): MacroState {
    const version = this._macroVersion(name);
    return {
      defined: undefined,
      definedCondition: { kind: "defined", name, defined: true, version },
      value: undefined,
      version
    };
  }

  private _macroVersion(name: string): number {
    return this._macroVersions[name] ?? 0;
  }

  private _nextMacroVersion(name: string): number {
    const version = this._macroVersion(name) + 1;
    this._macroVersions[name] = version;
    return version;
  }

  private _recordGuardUndef(name: string): void {
    const events = this._guardUndefBranches[name] ?? (this._guardUndefBranches[name] = []);
    events.push(
      this._branchStack.map(({ name, defined, conditionalGroup, conditionalArm, condition, precedingConditions }) => ({
        name,
        defined,
        conditionalGroup,
        conditionalArm,
        condition,
        precedingConditions
      }))
    );
  }

  private _parseSimpleCondition(expression: string): BranchCondition | undefined {
    try {
      return this._toBranchCondition(parsePreprocessorCondition(expression));
    } catch {
      return Lexer._parseOpaqueComparisonCondition(expression);
    }
  }

  private static _parseOpaqueComparisonCondition(expression: string): BranchCondition | undefined {
    const source = Lexer._unwrapConditionParentheses(expression.trim());
    let depth = 0;
    let comparisonIndex = -1;
    let comparisonOperator: "==" | "!=" | ">" | ">=" | "<" | "<=" | undefined;

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === "(") {
        depth++;
        continue;
      }
      if (char === ")") {
        if (--depth < 0) return undefined;
        continue;
      }
      if (depth !== 0) continue;
      const pair = source.slice(i, i + 2);
      if (pair === "&&" || pair === "||" || char === "?" || char === ",") return undefined;
      if (pair === "<<" || pair === ">>") {
        i++;
        continue;
      }
      const operator =
        pair === "==" || pair === "!=" || pair === ">=" || pair === "<="
          ? pair
          : char === ">" || char === "<"
            ? char
            : undefined;
      if (!operator) continue;
      if (comparisonOperator) return undefined;
      comparisonIndex = i;
      comparisonOperator = operator;
      i += operator.length - 1;
    }
    if (depth !== 0 || comparisonIndex < 0 || !comparisonOperator) return undefined;

    const left = source.slice(0, comparisonIndex).replace(/\s+/g, "");
    const right = source.slice(comparisonIndex + comparisonOperator.length).replace(/\s+/g, "");
    if (!left || !right) return undefined;
    const names = Array.from(new Set(`${left} ${right}`.match(/[A-Za-z_]\w*/g) ?? [])).sort();
    const [baseOperator, negated] =
      comparisonOperator === "!="
        ? (["==", true] as const)
        : comparisonOperator === "<="
          ? ([">", true] as const)
          : comparisonOperator === "<"
            ? ([">=", true] as const)
            : ([comparisonOperator, false] as const);
    return {
      kind: "expression",
      expression: `${baseOperator}(${left},${right})`,
      operator: "&&",
      operands: [],
      names,
      versions: names.map(() => 0),
      negated,
      opaque: true
    };
  }

  private static _unwrapConditionParentheses(expression: string): string {
    let source = expression;
    while (source.startsWith("(") && source.endsWith(")")) {
      let depth = 0;
      let wrapsAll = true;
      for (let i = 0; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") depth--;
        if (depth === 0 && i < source.length - 1) {
          wrapsAll = false;
          break;
        }
        if (depth < 0) return source;
      }
      if (!wrapsAll || depth !== 0) break;
      source = source.slice(1, -1).trim();
    }
    return source;
  }

  private _toBranchCondition(condition: PreprocessorCondition): BranchCondition {
    switch (condition.t) {
      case "bool":
        return { kind: "constant", value: condition.v };
      case "def":
        return { kind: "defined", name: condition.m, defined: true, version: 0 };
      case "cmp":
        return {
          kind: "comparison",
          name: condition.m,
          operator: condition.op as Extract<BranchCondition, { kind: "comparison" }>["operator"],
          value: condition.v,
          version: 0
        };
      case "not":
        return Lexer._negateSimpleCondition(this._toBranchCondition(condition.c))!;
      case "and":
      case "or": {
        const operands = [this._toBranchCondition(condition.l), this._toBranchCondition(condition.r)];
        const names = Array.from(new Set(operands.flatMap((operand) => Lexer._conditionNames(operand)))).sort();
        return {
          kind: "expression",
          expression: `${condition.t === "and" ? "&&" : "||"}(${operands.map(Lexer._conditionKey).sort().join(",")})`,
          operator: condition.t === "and" ? "&&" : "||",
          operands,
          names,
          versions: names.map(() => 0),
          negated: false
        };
      }
    }
  }

  private static _conditionNames(condition: BranchCondition): readonly string[] {
    if (condition.kind === "constant") return [];
    if (condition.kind === "expression") return condition.names;
    return [condition.name];
  }

  private static _conditionKey(condition: BranchCondition): string {
    if (condition.kind === "constant") return `constant:${condition.value}`;
    if (condition.kind === "defined") return `defined:${condition.name}:${condition.defined}`;
    if (condition.kind === "expression") return `${condition.negated ? "!" : ""}${condition.expression}`;
    return `comparison:${condition.name}:${condition.operator}:${condition.value}`;
  }

  private static _sameCondition(left: BranchCondition, right: BranchCondition): boolean {
    if (left.kind !== right.kind) return false;
    if (left.kind === "constant") return right.kind === "constant" && left.value === right.value;
    if (left.kind === "defined") {
      return (
        right.kind === "defined" &&
        left.name === right.name &&
        left.defined === right.defined &&
        left.version === right.version
      );
    }
    if (left.kind === "comparison") {
      return (
        right.kind === "comparison" &&
        left.name === right.name &&
        left.operator === right.operator &&
        left.value === right.value &&
        left.version === right.version
      );
    }
    if (right.kind !== "expression" || left.operator !== right.operator || left.negated !== right.negated) return false;
    if (left.opaque || right.opaque) {
      return left.opaque === right.opaque && left.expression === right.expression;
    }
    if (left.operands.length !== right.operands.length) return false;
    for (let i = 0, n = left.operands.length; i < n; i++) {
      if (!Lexer._sameCondition(left.operands[i], right.operands[i])) return false;
    }
    return true;
  }

  private static _substituteExternalMacroState(condition: BranchCondition, macroName: string): BranchCondition {
    if (condition.kind === "constant" || condition.kind === "comparison") return condition;
    if (condition.kind === "defined") {
      return condition.name === macroName ? { kind: "constant", value: !condition.defined } : condition;
    }
    if (condition.opaque) return condition;
    const substituted = Lexer._combineConditions(
      condition.operator,
      condition.operands.map((operand) => Lexer._substituteExternalMacroState(operand, macroName))
    );
    return condition.negated ? Lexer._negateSimpleCondition(substituted)! : substituted;
  }

  private static _combineConditions(operator: "&&" | "||", conditions: readonly BranchCondition[]): BranchCondition {
    const operands: BranchCondition[] = [];
    for (let i = 0, n = conditions.length; i < n; i++) {
      const condition = conditions[i];
      if (condition.kind === "constant") {
        if ((operator === "&&" && !condition.value) || (operator === "||" && condition.value)) return condition;
        continue;
      }
      operands.push(condition);
    }
    if (!operands.length) return { kind: "constant", value: operator === "&&" };
    if (operands.length === 1) return operands[0];

    const versions = new Map<string, number>();
    const names = new Set<string>();
    for (let i = 0, n = operands.length; i < n; i++) Lexer._collectConditionVersions(operands[i], names, versions);
    const sortedNames = Array.from(names).sort();
    return {
      kind: "expression",
      expression: `${operator}(${operands.map(Lexer._conditionKey).sort().join(",")})`,
      operator,
      operands,
      names: sortedNames,
      versions: sortedNames.map((name) => versions.get(name) ?? 0),
      negated: false
    };
  }

  private static _collectConditionVersions(
    condition: BranchCondition,
    names: Set<string>,
    versions: Map<string, number>
  ): void {
    if (condition.kind === "constant") return;
    if (condition.kind === "expression") {
      if (condition.opaque) {
        for (let i = 0; i < condition.names.length; i++) {
          names.add(condition.names[i]);
          versions.set(condition.names[i], condition.versions[i]);
        }
        return;
      }
      for (let i = 0, n = condition.operands.length; i < n; i++) {
        Lexer._collectConditionVersions(condition.operands[i], names, versions);
      }
      return;
    }
    names.add(condition.name);
    versions.set(condition.name, condition.version);
  }

  private static _negateSimpleCondition(condition?: BranchCondition): BranchCondition | undefined {
    if (!condition) return undefined;
    if (condition.kind === "constant") return { kind: "constant", value: !condition.value };
    if (condition.kind === "defined") return { ...condition, defined: !condition.defined };
    if (condition.kind === "expression") return { ...condition, negated: !condition.negated };

    const operator =
      condition.operator === "=="
        ? "!="
        : condition.operator === "!="
          ? "=="
          : condition.operator === ">"
            ? "<="
            : condition.operator === ">="
              ? "<"
              : condition.operator === "<"
                ? ">="
                : ">";
    return { ...condition, operator };
  }

  private static _parseNumericLiteral(source: string): number | undefined {
    if (!/^[-+]?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(source)) return undefined;
    const value = Number(source);
    return Number.isFinite(value) ? value : undefined;
  }

  private static _matchesComparison(
    value: number,
    comparison: Extract<BranchCondition, { kind: "comparison" }>
  ): boolean {
    switch (comparison.operator) {
      case "==":
        return value === comparison.value;
      case "!=":
        return value !== comparison.value;
      case ">":
        return value > comparison.value;
      case ">=":
        return value >= comparison.value;
      case "<":
        return value < comparison.value;
      case "<=":
        return value <= comparison.value;
    }
  }

  private static _cloneMacroStates(states: MacroStateMap): MacroStateMap {
    const clone: MacroStateMap = Object.create(null);
    for (const name in states) clone[name] = { ...states[name] };
    return clone;
  }

  private static _sameMacroState(left: MacroState, right: MacroState): boolean {
    return (
      left.defined === right.defined &&
      left.value === right.value &&
      left.version === right.version &&
      Lexer._sameCondition(left.definedCondition, right.definedCondition)
    );
  }
  // #endif

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
    const range = ShaderCompilerUtils.createRange(start, this.getShaderPosition());

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
      let branchReachable = Lexer._isCodegenBranchReachable(this._branchStack);
      // #if _VERBOSE
      if (this._branchAnalysisEnabled) branchReachable = isBranchReachable(this._branchStack);
      // #endif
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
    const token = BaseToken.pool.get();
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
    const token = BaseToken.pool.get();
    token.set(Keyword.MACRO_DEFINE_END, "\n", start);
    return token;
  }

  // Register a `#define` directive. Both AST and legacy paths funnel through
  // here using ranges already extracted by `_peekMacroDefine` / the value
  // state machine — no re-parsing the directive text.
  private _registerMacroDefine(
    name: string,
    paramsLexeme: string | undefined,
    valueStart: number,
    valueEnd: number
  ): void {
    // #if _VERBOSE
    if (this._branchAnalysisEnabled) {
      const branchIndex = this._branchStack.length - 1;
      const branch = this._branchStack[branchIndex];
      if (branch?.guardUndefBranches && branch.name === name && !branch.defined) {
        this._branchStack[branchIndex] = {
          ...branch,
          selfGuarding: true,
          guardUndefStart: branch.guardUndefBranches.length
        };
        const frame = this._conditionalFrames[this._conditionalFrames.length - 1];
        if (frame?.guardName === name) frame.selfGuarding = true;
      }
    }
    // #endif

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
      branch: this._branchStack.length === 0 ? EMPTY_BRANCH : this._branchStack.slice()
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
        let sameDefinitionBranch = Lexer._sameCodegenBranch(e.branch, info.branch);
        // #if _VERBOSE
        if (this._branchAnalysisEnabled) sameDefinitionBranch = sameBranch(e.branch, info.branch);
        // #endif
        if (e.dedupKey === dedupKey && sameDefinitionBranch) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) arr.push(info);
    }
    // #if _VERBOSE
    if (this._branchAnalysisEnabled) this._applyMacroDefine(name, paramsLexeme, valueStart, valueEnd);
    // #endif
  }

  /** Render a `[start, end)` value range as space-separated significant chars,
   *  using the same comment / line-continuation rules `_skipNonSemantic`
   *  applies on the token-stream path. Used as the dedup key body. */
  private static _normalizeValueText(src: string, start: number, end: number): string {
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
      let overlaps = Lexer._canCodegenBranchesOverlap(defs[i].branch, callSiteBranch);
      // #if _VERBOSE
      if (this._branchAnalysisEnabled) overlaps = canBranchesOverlap(defs[i].branch, callSiteBranch);
      // #endif
      if (overlaps) {
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
