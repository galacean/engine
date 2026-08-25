import {
  expandPreprocessorExpressionMacros,
  evaluatePartiallyKnownPreprocessorConditionResult,
  parsePreprocessorExpression,
  resolvePreprocessorDefinedOperators,
  type Condition,
  type PartiallyKnownPreprocessorExpressionContext,
  type PreprocessorExpressionMacro
} from "@galacean/engine-design";

interface MacroState {
  readonly defined: boolean | undefined;
  readonly replacement?: Condition;
  readonly replacementKey?: string;
  readonly functionParams?: readonly string[];
  readonly functionBody?: string;
}

type MacroStateMap = Record<string, MacroState>;

interface ConditionalFrame {
  readonly parentReachable: boolean;
  remainderReachable: boolean;
  hasElse: boolean;
  readonly entryState: MacroStateMap;
  remainderState: MacroStateMap;
  readonly armStates: MacroStateMap[];
  readonly mutatedNames: Set<string>;
}

interface ConditionResult {
  readonly value: boolean | undefined;
  readonly error?: string;
  readonly errorStart?: number;
  readonly errorEnd?: number;
  readonly trueAssumption?: MacroAssumption;
  readonly falseAssumption?: MacroAssumption;
}

interface MacroAssumption {
  readonly name: string;
  readonly defined: boolean;
}

/** @internal */
export interface PreprocessorMacroSnapshot {
  readonly states: MacroStateMap;
}

/** @internal */
export interface CachedPreprocessorMacroState {
  readonly snapshot: PreprocessorMacroSnapshot;
  readonly mutatedNames: readonly string[];
}

/** @internal */
export interface PreprocessorDirectiveResult {
  /** Whether the directive remains reachable in at least one macro configuration. */
  readonly keep: boolean;
  /** Deterministic expression failure, when present. */
  readonly error?: string;
  /** Start offset of the failure relative to the trimmed directive expression. */
  readonly errorStart?: number;
  /** Exclusive end offset of the failure relative to the trimmed directive expression. */
  readonly errorEnd?: number;
}

/**
 * Tracks source-defined macros while the include expander walks one preprocessing stream.
 *
 * External macros start unknown. Conditional mutations are merged across every reachable arm, so
 * callers only prune source when all configurations agree that an arm is dead.
 * @internal
 */
export class PreprocessorMacroState {
  private _states: MacroStateMap = Object.create(null);
  private readonly _frames: ConditionalFrame[] = [];
  private readonly _expressionContext: PartiallyKnownPreprocessorExpressionContext = {
    resolveIdentifier: (name) => this._resolveIdentifier(name, new Set()),
    isDefined: (name) => this._state(name).defined
  };

  reachable = true;

  /**
   * Applies a non-include directive and reports reachability plus definite evaluation failures.
   * @param directive - Directive keyword without `#`.
   * @param body - Comment-masked logical directive body.
   * @returns Directive reachability and an optional deterministic expression error.
   */
  processDirective(directive: string, body: string): PreprocessorDirectiveResult {
    switch (directive) {
      case "if": {
        const condition = this.reachable ? this._evaluate(body) : { value: undefined };
        return {
          keep: this._openConditional(condition),
          error: condition.error,
          errorStart: condition.errorStart,
          errorEnd: condition.errorEnd
        };
      }
      case "ifdef": {
        const condition = this._definedCondition(body, true);
        return { keep: this._openConditional(condition), error: condition.error };
      }
      case "ifndef": {
        const condition = this._definedCondition(body, false);
        return { keep: this._openConditional(condition), error: condition.error };
      }
      case "elif":
        return this._advanceConditional(body);
      case "else":
        return { keep: this._advanceElse() };
      case "endif":
        return { keep: this._closeConditional() };
      case "define": {
        const keep = this.reachable;
        if (keep) this._define(body);
        return { keep };
      }
      case "undef": {
        const keep = this.reachable;
        if (keep) this._undef(body);
        return { keep };
      }
      default:
        return { keep: this.reachable };
    }
  }

  /** @internal */
  captureSnapshot(): PreprocessorMacroSnapshot {
    return { states: PreprocessorMacroState._cloneStates(this._states) };
  }

  /** @internal */
  createCachedState(before: PreprocessorMacroSnapshot): CachedPreprocessorMacroState {
    const names = new Set([...Object.keys(before.states), ...Object.keys(this._states)]);
    const mutatedNames: string[] = [];
    for (const name of names) {
      if (!PreprocessorMacroState._sameState(this._stateFrom(before.states, name), this._state(name))) {
        mutatedNames.push(name);
      }
    }
    return { snapshot: this.captureSnapshot(), mutatedNames };
  }

  /** @internal */
  applyCachedState(cached: CachedPreprocessorMacroState): void {
    for (let i = 0, n = cached.mutatedNames.length; i < n; i++) this._markMutation(cached.mutatedNames[i]);
    this._states = PreprocessorMacroState._cloneStates(cached.snapshot.states);
  }

  /** @internal */
  cacheKey(): string {
    const names = Object.keys(this._states).sort();
    let key = "";
    for (let i = 0, n = names.length; i < n; i++) {
      const name = names[i];
      const state = this._states[name];
      const defined = state.defined === undefined ? "?" : state.defined ? "1" : "0";
      const replacement = state.replacementKey ?? "";
      key += `${name.length}:${name}${defined}${replacement.length}:${replacement}`;
    }
    return key;
  }

  private _openConditional(condition: ConditionResult): boolean {
    const parentReachable = this.reachable;
    const entryState = PreprocessorMacroState._cloneStates(this._states);
    const remainderState = PreprocessorMacroState._cloneStates(entryState);
    if (parentReachable && condition.value === undefined) {
      this._applyAssumption(this._states, condition.trueAssumption);
      this._applyAssumption(remainderState, condition.falseAssumption);
    }
    this._frames.push({
      parentReachable,
      remainderReachable: parentReachable && condition.value !== true,
      hasElse: false,
      entryState,
      remainderState,
      armStates: [],
      mutatedNames: new Set()
    });
    this.reachable = parentReachable && condition.value !== false;
    return parentReachable;
  }

  private _advanceConditional(body: string): PreprocessorDirectiveResult {
    const frame = this._frames[this._frames.length - 1];
    if (!frame) return { keep: this.reachable };
    this._finishCurrentArm(frame);
    this._states = PreprocessorMacroState._cloneStates(frame.remainderState);
    if (frame.hasElse) {
      this.reachable = false;
      return { keep: frame.parentReachable };
    }

    const keep = frame.remainderReachable;
    if (!keep) {
      this.reachable = false;
      return { keep: false };
    }
    const condition = this._evaluate(body);
    frame.remainderState = PreprocessorMacroState._cloneStates(this._states);
    if (condition.value === undefined) {
      this._applyAssumption(this._states, condition.trueAssumption);
      this._applyAssumption(frame.remainderState, condition.falseAssumption);
    }
    this.reachable = condition.value !== false;
    if (condition.value === true) frame.remainderReachable = false;
    return {
      keep: true,
      error: condition.error,
      errorStart: condition.errorStart,
      errorEnd: condition.errorEnd
    };
  }

  private _advanceElse(): boolean {
    const frame = this._frames[this._frames.length - 1];
    if (!frame) return this.reachable;
    this._finishCurrentArm(frame);
    this._states = PreprocessorMacroState._cloneStates(frame.remainderState);
    const keep = !frame.hasElse && frame.remainderReachable;
    this.reachable = keep;
    frame.remainderReachable = false;
    frame.hasElse = true;
    return keep;
  }

  private _closeConditional(): boolean {
    const frame = this._frames.pop();
    if (!frame) return this.reachable;
    this._finishCurrentArm(frame);
    if (!frame.hasElse && frame.remainderReachable) {
      frame.armStates.push(PreprocessorMacroState._cloneStates(frame.remainderState));
    }
    this._states = this._mergeStates(frame);
    this.reachable = frame.parentReachable;
    return frame.parentReachable;
  }

  private _finishCurrentArm(frame: ConditionalFrame): void {
    if (this.reachable) frame.armStates.push(PreprocessorMacroState._cloneStates(this._states));
  }

  private _mergeStates(frame: ConditionalFrame): MacroStateMap {
    const merged = PreprocessorMacroState._cloneStates(frame.entryState);
    for (const name of frame.mutatedNames) {
      const candidates = frame.armStates.map((state) => this._stateFrom(state, name));
      const first = candidates[0] ?? this._stateFrom(frame.entryState, name);
      if (candidates.every((candidate) => PreprocessorMacroState._sameState(first, candidate))) {
        merged[name] = first;
        continue;
      }

      const defined = candidates.every((candidate) => candidate.defined === true)
        ? true
        : candidates.every((candidate) => candidate.defined === false)
          ? false
          : undefined;
      merged[name] = { defined };
    }
    return merged;
  }

  private _define(body: string): void {
    const match = /^[ \t]*([A-Za-z_]\w*)([\s\S]*)$/.exec(body);
    if (!match) return;
    const name = match[1];
    const suffix = match[2];
    this._markMutation(name);

    const replacementKey = suffix.trim();
    if (suffix[0] === "(") {
      const closeParen = suffix.indexOf(")");
      if (closeParen < 0) {
        this._states[name] = { defined: true, replacementKey };
        return;
      }
      const params = suffix
        .slice(1, closeParen)
        .split(",")
        .map((param) => param.trim())
        .filter(Boolean);
      this._states[name] = {
        defined: true,
        replacementKey,
        functionParams: params,
        functionBody: suffix.slice(closeParen + 1).trim()
      };
      return;
    }

    const parsed = replacementKey ? parsePreprocessorExpression(replacementKey) : undefined;
    this._states[name] = {
      defined: true,
      replacement: parsed?.ok ? parsed.condition : undefined,
      replacementKey
    };
  }

  private _undef(body: string): void {
    const name = /^[ \t]*([A-Za-z_]\w*)/.exec(body)?.[1];
    if (!name) return;
    this._markMutation(name);
    this._states[name] = { defined: false };
  }

  private _markMutation(name: string): void {
    for (let i = 0, n = this._frames.length; i < n; i++) this._frames[i].mutatedNames.add(name);
  }

  private _evaluate(expression: string): ConditionResult {
    const trimmedExpression = expression.trim();
    const unexpanded = parsePreprocessorExpression(trimmedExpression);
    if ("error" in unexpanded && unexpanded.error.certain) {
      return {
        value: undefined,
        error: unexpanded.error.message,
        errorStart: unexpanded.error.start,
        errorEnd: unexpanded.error.end
      };
    }

    const withDefinedValues = resolvePreprocessorDefinedOperators(
      trimmedExpression,
      (name) => this._state(name).defined
    );
    const expansion = expandPreprocessorExpressionMacros(withDefinedValues, (name) => this._macro(name));
    if (expansion.error) {
      return {
        value: undefined,
        error: expansion.error,
        errorStart: 0,
        errorEnd: trimmedExpression.length
      };
    }
    const expandedExpression = expansion.expression;
    const parsed = parsePreprocessorExpression(expandedExpression);
    if ("error" in parsed) {
      const error =
        parsed.error.certain || !parsed.hasExpandableIdentifier
          ? expandedExpression === withDefinedValues
            ? parsed.error.message
            : `Invalid preprocessor expression after expanding source macros: ${parsed.error.message}`
          : undefined;
      return { value: undefined, error, errorStart: 0, errorEnd: trimmedExpression.length };
    }
    const evaluated = evaluatePartiallyKnownPreprocessorConditionResult(parsed.condition, this._expressionContext);
    const assumptions = PreprocessorMacroState._conditionAssumptions(parsed.condition);
    return {
      value: evaluated.value === undefined ? undefined : evaluated.value !== 0,
      error: evaluated.error,
      errorStart: evaluated.error ? 0 : undefined,
      errorEnd: evaluated.error ? trimmedExpression.length : undefined,
      trueAssumption: assumptions?.trueAssumption,
      falseAssumption: assumptions?.falseAssumption
    };
  }

  private _definedCondition(body: string, whenDefined: boolean): ConditionResult {
    const name = /^[ \t]*([A-Za-z_]\w*)/.exec(body)?.[1];
    if (!name || !this.reachable) return { value: undefined };
    const defined = this._state(name).defined;
    return {
      value: defined === undefined ? undefined : defined === whenDefined,
      trueAssumption: { name, defined: whenDefined },
      falseAssumption: { name, defined: !whenDefined }
    };
  }

  private _applyAssumption(states: MacroStateMap, assumption: MacroAssumption | undefined): void {
    if (!assumption) return;
    const current = this._stateFrom(states, assumption.name);
    states[assumption.name] = assumption.defined ? { ...current, defined: true } : { defined: false };
  }

  private _resolveIdentifier(
    name: string,
    resolving: Set<string>
  ): { readonly value?: number; readonly error?: string } {
    const state = this._state(name);
    if (state.defined === false) return { value: 0 };
    if (state.defined !== true || state.functionParams || !state.replacementKey || resolving.has(name)) return {};
    resolving.add(name);
    const expansion = expandPreprocessorExpressionMacros(state.replacementKey, (macroName) => this._macro(macroName));
    if (expansion.error) {
      resolving.delete(name);
      return { error: expansion.error };
    }
    const expandedReplacement = expansion.expression;
    let replacement = state.replacement;
    if (expandedReplacement !== state.replacementKey || !replacement) {
      const parsed = parsePreprocessorExpression(expandedReplacement);
      if ("error" in parsed) {
        resolving.delete(name);
        return parsed.error.certain
          ? { error: `Invalid preprocessor expression after expanding '${name}': ${parsed.error.message}` }
          : {};
      }
      replacement = parsed.condition;
    }
    const result = evaluatePartiallyKnownPreprocessorConditionResult(replacement, {
      resolveIdentifier: (nestedName) => this._resolveIdentifier(nestedName, resolving),
      isDefined: (nestedName) => this._state(nestedName).defined
    });
    resolving.delete(name);
    return result.error
      ? { error: `Invalid preprocessor expression after expanding '${name}': ${result.error}` }
      : result;
  }

  private _macro(name: string): PreprocessorExpressionMacro | undefined {
    const state = this._state(name);
    if (state.defined !== true || state.replacementKey === undefined) return;
    return state.functionParams
      ? { body: state.functionBody ?? "", parameters: state.functionParams }
      : { body: state.replacementKey };
  }

  private _state(name: string): MacroState {
    return this._stateFrom(this._states, name);
  }

  private _stateFrom(states: MacroStateMap, name: string): MacroState {
    return states[name] ?? { defined: undefined };
  }

  private static _cloneStates(states: MacroStateMap): MacroStateMap {
    const clone: MacroStateMap = Object.create(null);
    for (const name in states) clone[name] = states[name];
    return clone;
  }

  private static _sameState(left: MacroState, right: MacroState): boolean {
    return left.defined === right.defined && left.replacementKey === right.replacementKey;
  }

  private static _conditionAssumptions(
    condition: Condition
  ): { trueAssumption: MacroAssumption; falseAssumption: MacroAssumption } | undefined {
    if (condition.t === "def") {
      return {
        trueAssumption: { name: condition.m, defined: true },
        falseAssumption: { name: condition.m, defined: false }
      };
    }
    if (condition.t === "ndef") {
      return {
        trueAssumption: { name: condition.m, defined: false },
        falseAssumption: { name: condition.m, defined: true }
      };
    }
    if (condition.t !== "not") return;
    const nested = this._conditionAssumptions(condition.c);
    return nested ? { trueAssumption: nested.falseAssumption, falseAssumption: nested.trueAssumption } : undefined;
  }
}
