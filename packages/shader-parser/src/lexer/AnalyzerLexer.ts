import { ETokenType } from "../common";
import { parsePreprocessorCondition, type PreprocessorCondition } from "../common/PreprocessorCondition";
import {
  type BranchCondition,
  type BranchConstraint,
  type BranchSignature,
  EOF,
  sameBranch
} from "../common/BaseToken";
import { canBranchesOverlap, isBranchReachable, isConditionalChainExhaustive } from "../common/BranchAnalysis";
import { Keyword } from "../common/enums/Keyword";
import { Lexer } from "./Lexer";

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

/**
 * Lexer variant that retains conditional facts required by the standalone analyzer.
 * @internal
 */
export class AnalyzerLexer extends Lexer {
  private _conditionalFrames: ConditionalFrame[] = [];
  private _guardUndefBranches: Record<string, BranchSignature[]> = Object.create(null);
  private _macroStates: MacroStateMap = Object.create(null);
  private _macroVersions: Record<string, number> = Object.create(null);
  private _pendingGuardUndef = false;
  private _pendingOpaqueConditional: "push" | "advance" | null = null;

  override *tokenize() {
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
    this._macroStates = AnalyzerLexer._cloneMacroStates(frame.entryState);
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
    if (resolved) frame.priorConditions.push(AnalyzerLexer._negateSimpleCondition(resolved)!);
    this._assumeCondition(armCondition);
  }

  private _advanceElseArm(): void {
    const frame = this._conditionalFrames[this._conditionalFrames.length - 1];
    const index = this._branchStack.length - 1;
    const top = this._branchStack[index];
    if (!frame || !top) return;
    this._finishCurrentArm(frame);
    this._macroStates = AnalyzerLexer._cloneMacroStates(frame.entryState);
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
      entryState: AnalyzerLexer._cloneMacroStates(this._macroStates),
      armStates: [],
      constraints: [activeConstraint],
      priorConditions: resolved ? [AnalyzerLexer._negateSimpleCondition(resolved)!] : [],
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
        state: AnalyzerLexer._cloneMacroStates(frame.entryState)
      });
    }
    this._macroStates = this._mergeMacroStates(frame);
    if (frame.guardName && frame.guardDefined === false && frame.selfGuarding) {
      this._setMacroState(frame.guardName, true, undefined);
    }
  }

  private _finishCurrentArm(frame: ConditionalFrame, branch = this._branchStack): void {
    if (isBranchReachable(branch)) {
      frame.armStates.push({ branch: branch.slice(), state: AnalyzerLexer._cloneMacroStates(this._macroStates) });
    }
  }

  private _mergeMacroStates(frame: ConditionalFrame): MacroStateMap {
    const merged = AnalyzerLexer._cloneMacroStates(frame.entryState);
    for (const name of frame.mutatedNames) {
      const first = frame.armStates[0]?.state[name] ?? frame.entryState[name] ?? this._defaultMacroState(name);
      let matches = true;
      for (let i = 1, n = frame.armStates.length; i < n; i++) {
        const candidate = frame.armStates[i].state[name] ?? frame.entryState[name] ?? this._defaultMacroState(name);
        if (!AnalyzerLexer._sameMacroState(first, candidate)) {
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
            AnalyzerLexer._combineConditions("&&", [this._branchCondition(arm.branch), state.definedCondition])
          );
        }
        merged[name] = {
          defined: undefined,
          definedCondition: AnalyzerLexer._combineConditions("||", definitionConditions),
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
    const expanded = AnalyzerLexer._combineConditions(
      condition.operator,
      condition.operands.map((operand) => this._expandDefinedMacroConditions(operand))
    );
    return condition.negated ? AnalyzerLexer._negateSimpleCondition(expanded)! : expanded;
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
      macroDefined = AnalyzerLexer._substituteExternalMacroState(macroDefined, condition.name);
    }
    return condition.defined ? macroDefined : AnalyzerLexer._negateSimpleCondition(macroDefined)!;
  }

  private _branchCondition(branch: BranchSignature): BranchCondition {
    const conditions: BranchCondition[] = [];
    for (let i = 0, n = branch.length; i < n; i++) {
      const constraint = branch[i];
      if (constraint.selfGuarding) continue;
      if (constraint.precedingConditions) conditions.push(...constraint.precedingConditions);
      if (constraint.condition) conditions.push(constraint.condition);
    }
    return AnalyzerLexer._combineConditions("&&", conditions);
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
    if (state.value !== undefined) return AnalyzerLexer._matchesComparison(state.value, condition);
    if (state.defined === false) return AnalyzerLexer._matchesComparison(0, condition);
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
        ? AnalyzerLexer._parseNumericLiteral(AnalyzerLexer._normalizeValueText(this._source, valueStart, valueEnd))
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
      return AnalyzerLexer._parseOpaqueComparisonCondition(expression);
    }
  }

  private static _parseOpaqueComparisonCondition(expression: string): BranchCondition | undefined {
    const source = AnalyzerLexer._unwrapConditionParentheses(expression.trim());
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
        return AnalyzerLexer._negateSimpleCondition(this._toBranchCondition(condition.c))!;
      case "and":
      case "or": {
        const operands = [this._toBranchCondition(condition.l), this._toBranchCondition(condition.r)];
        const names = Array.from(new Set(operands.flatMap((operand) => AnalyzerLexer._conditionNames(operand)))).sort();
        return {
          kind: "expression",
          expression: `${condition.t === "and" ? "&&" : "||"}(${operands.map(AnalyzerLexer._conditionKey).sort().join(",")})`,
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
      if (!AnalyzerLexer._sameCondition(left.operands[i], right.operands[i])) return false;
    }
    return true;
  }

  private static _substituteExternalMacroState(condition: BranchCondition, macroName: string): BranchCondition {
    if (condition.kind === "constant" || condition.kind === "comparison") return condition;
    if (condition.kind === "defined") {
      return condition.name === macroName ? { kind: "constant", value: !condition.defined } : condition;
    }
    if (condition.opaque) return condition;
    const substituted = AnalyzerLexer._combineConditions(
      condition.operator,
      condition.operands.map((operand) => AnalyzerLexer._substituteExternalMacroState(operand, macroName))
    );
    return condition.negated ? AnalyzerLexer._negateSimpleCondition(substituted)! : substituted;
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
    for (let i = 0, n = operands.length; i < n; i++)
      AnalyzerLexer._collectConditionVersions(operands[i], names, versions);
    const sortedNames = Array.from(names).sort();
    return {
      kind: "expression",
      expression: `${operator}(${operands.map(AnalyzerLexer._conditionKey).sort().join(",")})`,
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
        AnalyzerLexer._collectConditionVersions(condition.operands[i], names, versions);
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
      AnalyzerLexer._sameCondition(left.definedCondition, right.definedCondition)
    );
  }

  protected override _isBranchReachable(branch: BranchSignature): boolean {
    return isBranchReachable(branch);
  }

  protected override _beforeRegisterMacroDefine(name: string): void {
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

  protected override _sameDefinitionBranch(left: BranchSignature, right: BranchSignature): boolean {
    return sameBranch(left, right);
  }

  protected override _afterRegisterMacroDefine(
    name: string,
    paramsLexeme: string | undefined,
    valueStart: number,
    valueEnd: number
  ): void {
    this._applyMacroDefine(name, paramsLexeme, valueStart, valueEnd);
  }

  protected override _branchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    return canBranchesOverlap(left, right);
  }
}
