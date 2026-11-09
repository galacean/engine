import {
  ASTNode,
  BaseToken,
  BuiltinFunction,
  canBranchesOverlap,
  EMPTY_BRANCH,
  FnSymbol,
  isBranchReachable,
  Keyword,
  ParserUtils,
  ShaderClueIR,
  ShaderCoreInfo,
  ShaderBuiltinSemantic,
  sameBranch,
  TreeNode,
  type BranchCoverage,
  type BranchSignature,
  type ShaderEntryPointInfo,
  type ShaderRange
} from "@galacean/engine-shader-parser/internal/analyzer";
import { ShaderConditionDiagram } from "./ShaderConditionDiagram";
import type { MacroExpansionSyntax } from "@galacean/engine-shader-parser/internal/analyzer";

/**
 * Analyzer-only graph and reachability information derived from neutral shader IR.
 * @internal
 */
export class ShaderAnalysisInfo {
  private readonly _glFragColorReferences: ConditionalReference[] = [];
  private readonly _glFragDataConditionalReferences: ConditionalReference[] = [];

  /** References to the fragment output array, before indexed uses are filtered. */
  readonly glFragDataReferences: ShaderRange[] = [];

  private readonly _callFacts = new Map<ASTNode.FunctionDefinition, ConditionalCall[]>();
  private readonly _writes = new Map<ASTNode.FunctionDefinition, ConditionalWrite[]>();
  private readonly _unknownEffects = new Map<ASTNode.FunctionDefinition, BranchSignature[]>();
  private readonly _indexedMacroReferences = new Set<number>();
  private readonly _indexedMacroArguments = new Map<TreeNode, BranchSignature[]>();
  private readonly _functionsByName = new Map<string, ASTNode.FunctionDefinition[]>();
  private readonly _branches = new Set<BranchSignature>();
  private readonly _conditions: ShaderConditionDiagram;
  private readonly _reachableByEntry = new Map<ShaderEntryPointInfo, ReachableConditions>();
  private readonly _reachableByFunction = new Map<FnSymbol, ReachableConditions>();
  private readonly _writeReachableByFunction = new Map<FnSymbol, ReachableConditions>();

  /**
   * Builds analyzer-only facts without modifying the neutral IR or backend information.
   * @param ir - Neutral shader IR.
   * @param coreInfo - Backend entry and IO facts for the same IR.
   */
  constructor(
    readonly ir: ShaderClueIR,
    readonly coreInfo: ShaderCoreInfo
  ) {
    this._indexFunctions(ir.program);
    this._indexFunctionBodies();
    for (const entry of [coreInfo.vertexEntry, coreInfo.fragmentEntry]) {
      for (const fn of entry.functions) this._branches.add(fn.branchSignature ?? fn.astNode.protoType.ident.branch);
    }
    this._conditions = new ShaderConditionDiagram(this._branches);
    this._branches.clear();
  }

  /**
   * Finds every function reachable from an entry, including the entry declarations themselves.
   * @param entry - Entry point to traverse.
   * @returns Reachable function identities.
   */
  reachableFunctions(entry: ShaderEntryPointInfo): ReadonlySet<ASTNode.FunctionDefinition> {
    return new Set(this._getReachableConditions(entry).keys());
  }

  /**
   * Determines whether a branch inside a function is reachable from an entry under one consistent
   * macro configuration. An unresolved proof is not treated as evidence for a diagnostic.
   * @param entry - Entry point from which calls originate.
   * @param functionNode - Function containing the branch.
   * @param branch - Branch at the diagnostic site.
   * @returns Whether at least one macro configuration is proven to reach the site.
   */
  isFunctionBranchReachable(
    entry: ShaderEntryPointInfo,
    functionNode: ASTNode.FunctionDefinition,
    branch: BranchSignature
  ): boolean {
    const reachable = this._getReachableConditions(entry).get(functionNode) ?? ShaderConditionDiagram.FALSE;
    return (
      this._conditions.reachability(this._conditions.and(reachable, this._conditions.branch(branch))) === "reachable"
    );
  }

  /**
   * Classifies whether every reachable entry configuration writes a source identifier or builtin semantic.
   * @param entry - Entry point whose call graph is inspected.
   * @param target - Leftmost source identifier or builtin semantic of the assignment target.
   * @returns Proven coverage, a proven missing-write configuration, or an unresolved complex condition.
   */
  getReachableWriteCoverage(entry: ShaderEntryPointInfo, target: string | ShaderBuiltinSemantic): BranchCoverage {
    if (!entry.functions.length) return "unknown";
    const diagram = this._conditions;
    let result: BranchCoverage = "covered";
    for (const entryFunction of entry.functions) {
      const writes: number[] = [];
      const unknownEffects: number[] = [];
      for (const [functionNode, reachable] of this._getFunctionReachableConditions(entryFunction, true)) {
        for (const effect of this._unknownEffects.get(functionNode) ?? []) {
          unknownEffects.push(diagram.and(reachable, diagram.branch(effect, true)));
        }
        for (const write of this._writes.get(functionNode) ?? []) {
          if (write.target !== target) continue;
          writes.push(diagram.and(reachable, diagram.branch(write.branch, true)));
        }
      }
      const entryCondition = diagram.branch(
        entryFunction.branchSignature ?? entryFunction.astNode.protoType.ident.branch,
        true
      );
      const missing = diagram.and(entryCondition, diagram.not(diagram.orAll(writes)));
      if (missing === ShaderConditionDiagram.FALSE) continue;
      if (diagram.reachability(diagram.and(missing, diagram.not(diagram.orAll(unknownEffects)))) === "reachable") {
        return "uncovered";
      }
      result = "unknown";
    }
    return result;
  }

  /**
   * Classifies whether a function returns under every macro configuration reaching its declaration.
   * @param functionNode - Function whose body is inspected.
   * @returns Proven return coverage, a missing-return configuration, or unresolved coverage.
   */
  getReturnCoverage(functionNode: ASTNode.FunctionDefinition): BranchCoverage {
    const returns = this._returnCondition(functionNode.statements);
    // A body with no possible return is invalid whenever its declaration is selected.
    return returns === ShaderConditionDiagram.FALSE
      ? "uncovered"
      : this._conditions.coverage(returns, this._conditions.branch(functionNode.protoType.ident.branch, true));
  }

  /**
   * Finds references to the legacy fragment output that a fragment entry can actually reach.
   * @param entry - Fragment entry whose conditional call paths are inspected.
   * @returns Source ranges proven reachable under at least one consistent macro configuration.
   */
  reachableFragmentOutput0References(entry: ShaderEntryPointInfo): readonly ShaderRange[] {
    const locations: ShaderRange[] = [];
    for (const reference of this._glFragColorReferences) {
      if (this.isFunctionBranchReachable(entry, reference.functionNode, reference.branch)) {
        locations.push(reference.location);
      }
    }
    return locations;
  }

  /**
   * Finds legacy fragment-output references reachable from one exact entry declaration.
   * @param entryFunction - Exact macro-alternative function selected as the fragment entry.
   * @returns Source ranges proven reachable under the entry declaration's macro constraints.
   */
  reachableFragmentOutput0ReferencesFrom(entryFunction: FnSymbol): readonly ShaderRange[] {
    const reachable = this._getFunctionReachableConditions(entryFunction);
    const diagram = this._conditions;
    return this._glFragColorReferences
      .filter(
        (reference) =>
          diagram.reachability(
            diagram.and(
              reachable.get(reference.functionNode) ?? ShaderConditionDiagram.FALSE,
              diagram.branch(reference.branch)
            )
          ) === "reachable"
      )
      .map((reference) => reference.location);
  }

  /**
   * Finds a macro configuration in which one fragment entry can reach both legacy output forms.
   * @param entryFunction - Exact macro-alternative function selected as the fragment entry.
   * @returns The conflicting output ranges, or `undefined` when coexistence is disproven or unknown.
   */
  coexistingLegacyFragmentOutputsFrom(
    entryFunction: FnSymbol
  ): { output0: ShaderRange; outputArray: ShaderRange } | undefined {
    const reachable = this._getFunctionReachableConditions(entryFunction);
    const diagram = this._conditions;
    const at = (reference: ConditionalReference) =>
      diagram.and(
        reachable.get(reference.functionNode) ?? ShaderConditionDiagram.FALSE,
        diagram.branch(reference.branch)
      );
    for (const output0 of this._glFragColorReferences) {
      const output0Condition = at(output0);
      if (output0Condition === ShaderConditionDiagram.FALSE) continue;
      for (const outputArray of this._glFragDataConditionalReferences) {
        if (diagram.reachability(diagram.and(output0Condition, at(outputArray))) === "reachable") {
          return { output0: output0.location, outputArray: outputArray.location };
        }
      }
    }
    return;
  }

  /**
   * Returns every parsed function declaration.
   * @returns Function identities retained by the neutral IR.
   */
  functions(): readonly ASTNode.FunctionDefinition[] {
    const result: ASTNode.FunctionDefinition[] = [];
    this._functionsByName.forEach((functions) => result.push(...functions));
    return result;
  }

  /**
   * Finds satisfiable mutual recursion without enumerating conditional call paths or all simple cycles.
   * @returns One witness per canonical minimum participant; an opaque-dependent cycle has no fixed chain.
   */
  mutualRecursionWitnesses(): readonly {
    marker: ASTNode.FunctionDefinition;
    cycle?: readonly ASTNode.FunctionDefinition[];
  }[] {
    const witnesses: { marker: ASTNode.FunctionDefinition; cycle?: readonly ASTNode.FunctionDefinition[] }[] = [];
    const functions = this.functions();
    const order = new Map(functions.map((fn, index) => [fn, index]));
    const diagram = this._conditions;
    for (const component of this._cyclicComponents()) {
      const members = functions.filter((fn) => component.has(fn));
      const simple = members.every(
        (fn) =>
          new Set(
            (this._callFacts.get(fn) ?? [])
              .filter((call) => call.callee !== fn && component.has(call.callee))
              .map((call) => call.callee)
          ).size === 1
      );
      const minimum = members.reduce((left, right) =>
        right.protoType.ident.lexeme < left.protoType.ident.lexeme ? right : left
      );
      // A simple component has only one non-self cycle, regardless of its conditional edge alternatives.
      for (const marker of simple ? [minimum] : members) {
        const name = marker.protoType.ident.lexeme;
        const allowed = new Set(
          Array.from(component).filter(
            (fn) =>
              fn.protoType.ident.lexeme > name ||
              (fn.protoType.ident.lexeme === name && order.get(fn)! >= order.get(marker)!)
          )
        );
        if (allowed.size < 2) continue;
        const declaration = diagram.branch(marker.protoType.ident.branch);
        const seeds: [ASTNode.FunctionDefinition, number][] = [];
        for (const call of this._callFacts.get(marker) ?? []) {
          if (call.callee === marker || !allowed.has(call.callee)) continue;
          seeds.push([call.callee, diagram.and(declaration, this._callCondition(call, false))]);
        }
        const cycleCondition =
          this._propagateConditions(seeds, false, allowed, marker).get(marker) ?? ShaderConditionDiagram.FALSE;
        if (diagram.reachability(cycleCondition) !== "reachable") continue;
        const witness = diagram.knownWitness(cycleCondition);
        witnesses.push({ marker, cycle: this._findCycleWitness(marker, allowed, witness) });
      }
    }
    return witnesses;
  }

  private _indexFunctions(root: TreeNode): void {
    const pending: (TreeNode | BaseToken)[] = [root];
    while (pending.length) {
      const node = pending.pop()!;
      if (node instanceof BaseToken) {
        this._branches.add(node.branch);
        continue;
      }
      this._branches.add(node._branch);
      if (node instanceof ASTNode.FunctionDefinition) {
        const name = node.protoType.ident.lexeme;
        const functions = this._functionsByName.get(name) ?? [];
        functions.push(node);
        this._functionsByName.set(name, functions);
      }
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index];
        if (child instanceof TreeNode || child instanceof BaseToken) pending.push(child);
      }
    }
  }

  private _indexFunctionBodies(): void {
    this._functionsByName.forEach((functions) => {
      for (const functionNode of functions) this._walkFunction(functionNode, functionNode.statements);
    });
    for (const [caller, calls] of this._callFacts) {
      const unique: ConditionalCall[] = [];
      const branchesByCallee = new Map<ASTNode.FunctionDefinition, BranchSignature[]>();
      for (const call of calls) {
        const branches = branchesByCallee.get(call.callee) ?? [];
        if (branches.some((branch) => sameBranch(branch, call.branch))) continue;
        branches.push(call.branch);
        branchesByCallee.set(call.callee, branches);
        unique.push(call);
      }
      this._callFacts.set(caller, unique);
    }
  }

  private _walkFunction(functionNode: ASTNode.FunctionDefinition, node: TreeNode): void {
    walkEffectiveShaderSyntax(
      node,
      (node, branch, location) => {
        this._branches.add(branch);
        if (node instanceof ASTNode.PostfixExpression && node.children.length === 4) {
          const base = node.children[0];
          if (base instanceof TreeNode) {
            const target = assignmentTargetBase(base);
            if (target instanceof ASTNode.MacroCallSymbol || target instanceof ASTNode.MacroCallFunction) {
              this._indexedMacroReferences.add(target.location.start.index);
            }
          }
        }
        if (node instanceof ASTNode.FunctionCallGeneric) this._recordCall(functionNode, node, branch);
        if (node instanceof ASTNode.VariableIdentifier) {
          if (node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutput0) {
            this._glFragColorReferences.push({ functionNode, location, branch });
          } else if (node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray) {
            if (
              !(this._indexedMacroArguments.get(node) ?? []).some((indexedBranch) => sameBranch(indexedBranch, branch))
            ) {
              this.glFragDataReferences.push(location);
            }
            this._glFragDataConditionalReferences.push({ functionNode, location, branch });
          }
        }
        if (node instanceof ASTNode.AssignmentExpression && node.children.length === 3) {
          const lhs = node.children[0];
          if (lhs instanceof TreeNode) {
            this._recordAssignmentTarget(functionNode, lhs, branch);
          }
        }
      },
      (syntax, branch, location) => {
        this._branches.add(branch);
        const indexedAlias = this._indexedMacroReferences.has(location.start.index);
        if (indexedAlias && syntax.valueTarget instanceof TreeNode) {
          const argument = assignmentTargetBase(syntax.valueTarget);
          if (argument instanceof ASTNode.VariableIdentifier) {
            const branches = this._indexedMacroArguments.get(argument) ?? [];
            branches.push(branch);
            this._indexedMacroArguments.set(argument, branches);
          }
        }
        for (const target of syntax.writtenTargets ?? []) {
          this._recordAssignmentTarget(functionNode, target, branch);
        }
        for (const reference of syntax.references) {
          if (reference.builtinSemantic === ShaderBuiltinSemantic.FragmentOutput0) {
            this._glFragColorReferences.push({ functionNode, location, branch });
          } else if (reference.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray) {
            if (
              !reference.indexed &&
              !(indexedAlias && syntax.valueTarget === ShaderBuiltinSemantic.FragmentOutputArray)
            ) {
              this.glFragDataReferences.push(location);
            }
            this._glFragDataConditionalReferences.push({ functionNode, location, branch });
          }
          for (const candidate of reference.functions) {
            const facts = this._callFacts.get(functionNode) ?? [];
            facts.push({ callee: candidate.astNode, branch });
            this._callFacts.set(functionNode, facts);
          }
        }
      },
      EMPTY_BRANCH,
      undefined,
      (branch) => {
        this._branches.add(branch);
        const effects = this._unknownEffects.get(functionNode) ?? [];
        effects.push(branch);
        this._unknownEffects.set(functionNode, effects);
      }
    );
  }

  private _recordCall(
    caller: ASTNode.FunctionDefinition,
    call: ASTNode.FunctionCallGeneric,
    branch = call._branch
  ): void {
    const candidates = call.fnSymbols ?? (call.fnSymbol instanceof FnSymbol ? [call.fnSymbol] : []);
    if (!candidates.length) return;
    const facts = this._callFacts.get(caller) ?? [];
    for (const candidate of candidates) {
      facts.push({ callee: candidate.astNode, branch });
      this._recordOutputParameterWrites(caller, call, candidate, branch);
    }
    this._callFacts.set(caller, facts);
  }

  private _returnCondition(root: TreeNode): number {
    type Visit = { node: TreeNode; returns: number[] } | { left: number[]; right: number[]; returns: number[] };
    const diagram = this._conditions;
    const returns: number[] = [];
    const pending: Visit[] = [{ node: root, returns }];
    while (pending.length) {
      const current = pending.pop()!;
      if ("left" in current) {
        // A runtime if/else guarantees a return only where both arms terminate.
        current.returns.push(diagram.and(diagram.orAll(current.left), diagram.orAll(current.right)));
        continue;
      }
      const { node, returns } = current;
      const branch = diagram.branch(node._branch, true);
      if (branch === ShaderConditionDiagram.FALSE) continue;
      if (node instanceof ASTNode.JumpStatement) {
        const keyword = node.children[0];
        if (keyword instanceof BaseToken && keyword.type === Keyword.RETURN) returns.push(branch);
      } else if (node instanceof ASTNode.SelectionStatement) {
        if (node.children.length !== 7) continue;
        const left: number[] = [],
          right: number[] = [];
        pending.push({ left, right, returns });
        pending.push({ node: node.children[6] as TreeNode, returns: right });
        pending.push({ node: node.children[4] as TreeNode, returns: left });
      } else if (node instanceof ASTNode.IterationStatement) {
        // Loop termination is not proven here, so missing return coverage remains unknown
        returns.push(diagram.and(branch, ShaderConditionDiagram.UNKNOWN));
      } else if (
        node instanceof ASTNode.Statement ||
        node instanceof ASTNode.SimpleStatement ||
        node instanceof ASTNode.CompoundStatement ||
        node instanceof ASTNode.CompoundStatementNoScope ||
        node instanceof ASTNode.StatementList ||
        node instanceof ASTNode.MacroIfStatement ||
        node instanceof ASTNode.MacroBranch
      ) {
        // Flatten sequential containers before unioning, including left-recursive statement lists.
        for (let index = node.children.length - 1; index >= 0; index--) {
          const child = node.children[index];
          if (child instanceof TreeNode) pending.push({ node: child, returns });
        }
      }
    }
    return diagram.orAll(returns);
  }

  private _getReachableConditions(entry: ShaderEntryPointInfo): ReachableConditions {
    const cached = this._reachableByEntry.get(entry);
    if (cached) return cached;
    const reachable =
      entry.functions.length === 1
        ? this._getFunctionReachableConditions(entry.functions[0])
        : this._propagateConditions(
            entry.functions.map((fn) => [
              fn.astNode,
              this._conditions.branch(fn.branchSignature ?? fn.astNode.protoType.ident.branch)
            ]),
            false
          );
    this._reachableByEntry.set(entry, reachable);
    return reachable;
  }

  private _getFunctionReachableConditions(entry: FnSymbol, forWrites = false): ReachableConditions {
    const cache = forWrites ? this._writeReachableByFunction : this._reachableByFunction;
    const cached = cache.get(entry);
    if (cached) return cached;
    const reachable = this._propagateConditions(
      [
        [
          entry.astNode,
          this._conditions.branch(entry.branchSignature ?? entry.astNode.protoType.ident.branch, forWrites)
        ]
      ],
      forWrites
    );
    cache.set(entry, reachable);
    return reachable;
  }

  private _callCondition(call: ConditionalCall, forWrites: boolean): number {
    return this._conditions.and(
      this._conditions.branch(call.branch, forWrites),
      this._conditions.branch(call.callee.protoType.ident.branch, forWrites)
    );
  }

  private _propagateConditions(
    seeds: readonly (readonly [ASTNode.FunctionDefinition, number])[],
    forWrites: boolean,
    allowed?: ReadonlySet<ASTNode.FunctionDefinition>,
    terminal?: ASTNode.FunctionDefinition
  ): ReachableConditions {
    const diagram = this._conditions;
    const reachable = new Map<ASTNode.FunctionDefinition, number>();
    const queued = new Map<ASTNode.FunctionDefinition, number[]>();
    const pending: ASTNode.FunctionDefinition[] = [];
    const enqueue = (fn: ASTNode.FunctionDefinition, condition: number) => {
      if (condition === ShaderConditionDiagram.FALSE || (allowed && !allowed.has(fn))) return;
      const incoming = queued.get(fn);
      if (incoming) {
        incoming.push(condition);
      } else {
        queued.set(fn, [condition]);
        pending.push(fn);
      }
    };
    for (const [fn, condition] of seeds) enqueue(fn, condition);
    for (let index = 0; index < pending.length; index++) {
      const fn = pending[index];
      const incoming = queued.get(fn)!;
      queued.delete(fn);
      const previous = reachable.get(fn) ?? ShaderConditionDiagram.FALSE;
      incoming.push(previous);
      // Batch incoming edges so high fan-in does not build every prefix of the same union.
      const condition = diagram.orAll(incoming);
      if (condition === previous) continue;
      reachable.set(fn, condition);
      if (fn === terminal) continue;
      for (const call of this._callFacts.get(fn) ?? []) {
        enqueue(call.callee, diagram.and(condition, this._callCondition(call, forWrites)));
      }
    }
    return reachable;
  }

  private _cyclicComponents(): readonly ReadonlySet<ASTNode.FunctionDefinition>[] {
    const functions = this.functions();
    const reverse = new Map<ASTNode.FunctionDefinition, ASTNode.FunctionDefinition[]>();
    for (const [caller, calls] of this._callFacts) {
      for (const { callee } of calls) {
        const incoming = reverse.get(callee) ?? [];
        incoming.push(caller);
        reverse.set(callee, incoming);
      }
    }
    const visited = new Set<ASTNode.FunctionDefinition>();
    const finished: ASTNode.FunctionDefinition[] = [];
    for (const start of functions) {
      if (visited.has(start)) continue;
      const pending = [{ node: start, finish: false }];
      while (pending.length) {
        const { node, finish } = pending.pop()!;
        if (finish) {
          finished.push(node);
          continue;
        }
        if (visited.has(node)) continue;
        visited.add(node);
        pending.push({ node, finish: true });
        for (const { callee } of this._callFacts.get(node) ?? []) pending.push({ node: callee, finish: false });
      }
    }
    visited.clear();
    const components: Set<ASTNode.FunctionDefinition>[] = [];
    while (finished.length) {
      const start = finished.pop()!;
      if (visited.has(start)) continue;
      const component = new Set<ASTNode.FunctionDefinition>();
      const pending = [start];
      while (pending.length) {
        const node = pending.pop()!;
        if (visited.has(node)) continue;
        visited.add(node);
        component.add(node);
        pending.push(...(reverse.get(node) ?? []));
      }
      if (component.size > 1) components.push(component);
    }
    return components;
  }

  private _findCycleWitness(
    marker: ASTNode.FunctionDefinition,
    allowed: ReadonlySet<ASTNode.FunctionDefinition>,
    witness: number
  ): readonly ASTNode.FunctionDefinition[] | undefined {
    if (witness === ShaderConditionDiagram.FALSE) return;
    const visited = new Set<ASTNode.FunctionDefinition>([marker]);
    const stack = [{ node: marker, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const calls = this._callFacts.get(frame.node) ?? [];
      if (frame.next === calls.length) {
        stack.pop();
        continue;
      }
      const call = calls[frame.next++];
      if (
        !allowed.has(call.callee) ||
        call.callee === frame.node ||
        this._conditions.coverage(this._callCondition(call, false), witness) !== "covered"
      )
        continue;
      if (call.callee === marker && stack.length > 1) return stack.map((item) => item.node);
      if (!visited.has(call.callee)) {
        visited.add(call.callee);
        stack.push({ node: call.callee, next: 0 });
      }
    }
  }

  private _recordOutputParameterWrites(
    caller: ASTNode.FunctionDefinition,
    call: ASTNode.FunctionCallGeneric,
    callee: FnSymbol,
    callBranch: BranchSignature
  ): void {
    const argumentList = call.children[2];
    if (!(argumentList instanceof ASTNode.FunctionCallParameterList)) return;
    const parameters = callee.astNode.protoType.parameterList ?? [];
    for (let i = 0, n = Math.min(parameters.length, argumentList.paramNodes.length); i < n; i++) {
      const parameter = parameters[i].astNode;
      if (!(parameter instanceof ASTNode.ParameterDeclaration)) continue;
      if (!ParserUtils.hasQualifier(parameter, Keyword.OUT) && !ParserUtils.hasQualifier(parameter, Keyword.INOUT)) {
        continue;
      }
      const argument = argumentList.paramNodes[i];
      if (!(argument instanceof TreeNode)) continue;
      const branch = combineBranches(callBranch, callee.branchSignature ?? EMPTY_BRANCH);
      if (branch) this._recordAssignmentTarget(caller, argument, branch);
    }
  }

  private _recordAssignmentTarget(
    functionNode: ASTNode.FunctionDefinition,
    target: string | TreeNode,
    branch: BranchSignature
  ): void {
    if (typeof target === "string") {
      this._recordWrite(functionNode, target, branch);
      return;
    }
    const current = assignmentTargetBase(target);
    if (current instanceof ASTNode.MacroCallSymbol || current instanceof ASTNode.MacroCallFunction) {
      for (const syntax of current.expandedSyntax ?? []) {
        if (syntax.valueTarget === undefined) continue;
        const targetBranch = combineBranches(branch, syntax.branch);
        if (targetBranch) this._recordAssignmentTarget(functionNode, syntax.valueTarget, targetBranch);
      }
      return;
    }
    if (current instanceof ASTNode.VariableIdentifier) {
      const child = current.children[0];
      const name = current.builtinSemantic ?? (child instanceof BaseToken ? child.lexeme : undefined);
      if (name !== undefined) this._recordWrite(functionNode, name, branch);
    }
  }

  private _recordWrite(
    functionNode: ASTNode.FunctionDefinition,
    target: string | ShaderBuiltinSemantic,
    branch: BranchSignature
  ): void {
    this._branches.add(branch);
    const writes = this._writes.get(functionNode) ?? [];
    writes.push({ target, branch });
    this._writes.set(functionNode, writes);
  }
}

/**
 * Visits effective source syntax while leaving unresolved macro arguments unproven.
 * @param node - Source syntax to inspect.
 * @param visit - Receives ordinary syntax and its effective branch and location.
 * @param visitMacro - Receives proven macro expansion facts at the invocation location.
 * @param incoming - Additional constraints from a containing macro expansion.
 * @param mappedLocation - Invocation location for syntax projected from a macro argument.
 * @param visitUnknown - Receives branches where macro execution effects cannot be proven.
 * @internal
 */
export function walkEffectiveShaderSyntax(
  node: TreeNode,
  visit: (node: TreeNode, branch: BranchSignature, location: ShaderRange) => void,
  visitMacro: (syntax: MacroExpansionSyntax, branch: BranchSignature, location: ShaderRange) => void,
  incoming: BranchSignature = EMPTY_BRANCH,
  mappedLocation?: ShaderRange,
  visitUnknown?: (branch: BranchSignature) => void
): void {
  type Visit =
    | { node: TreeNode; incoming: BranchSignature; mappedLocation?: ShaderRange }
    | { syntax: MacroExpansionSyntax; branch: BranchSignature; location: ShaderRange };
  const pending: Visit[] = [{ node, incoming, mappedLocation }];
  while (pending.length) {
    const current = pending.pop()!;
    if ("syntax" in current) {
      const { syntax, branch, location } = current;
      visitMacro(syntax, branch, location);
      if (syntax.hasUnknownEffects) visitUnknown?.(branch);
      for (let index = syntax.arguments.length - 1; index >= 0; index--) {
        pending.push({ node: syntax.arguments[index], incoming: branch, mappedLocation: location });
      }
      continue;
    }
    const { node, incoming, mappedLocation } = current;
    const branch = combineBranches(incoming, node._branch);
    if (!branch || !isBranchReachable(branch) || node instanceof ASTNode.MacroDefine) continue;
    const location = mappedLocation ?? node.location;
    if (node instanceof ASTNode.MacroCallSymbol || node instanceof ASTNode.MacroCallFunction) {
      if (!node.expandedSyntax?.length) visitUnknown?.(branch);
      for (let index = (node.expandedSyntax?.length ?? 0) - 1; index >= 0; index--) {
        const syntax = node.expandedSyntax![index];
        const expandedBranch = combineBranches(branch, syntax.branch);
        if (expandedBranch) pending.push({ syntax, branch: expandedBranch, location });
      }
      continue;
    }
    visit(node, branch, location);
    if (node instanceof ASTNode.FunctionCallGeneric) {
      const identifier = node.children[0] as ASTNode.FunctionIdentifier;
      if (
        !identifier.isBuiltin &&
        !BuiltinFunction.isExist(identifier.lexeme) &&
        !(node.fnSymbols?.length || node.fnSymbol instanceof FnSymbol)
      ) {
        visitUnknown?.(branch);
        continue;
      }
    }
    for (let index = node.children.length - 1; index >= 0; index--) {
      const child = node.children[index];
      // Container branches describe their first token, not every following sibling statement.
      if (child instanceof TreeNode) pending.push({ node: child, incoming, mappedLocation });
    }
  }
}

interface ConditionalCall {
  readonly callee: ASTNode.FunctionDefinition;
  readonly branch: BranchSignature;
}

interface ConditionalWrite {
  readonly target: string | ShaderBuiltinSemantic;
  readonly branch: BranchSignature;
}

interface ConditionalReference {
  readonly functionNode: ASTNode.FunctionDefinition;
  readonly location: ShaderRange;
  readonly branch: BranchSignature;
}

type ReachableConditions = ReadonlyMap<ASTNode.FunctionDefinition, number>;

function combineBranches(left: BranchSignature, right: BranchSignature): BranchSignature | undefined {
  if (!canBranchesOverlap(left, right)) return;
  if (!left.length) return right;
  if (!right.length) return left;
  const combined = left.slice();
  for (const constraint of right) {
    if (combined.includes(constraint)) continue;
    if (
      constraint.conditionalGroup !== undefined &&
      combined.some(
        (existing) =>
          existing.conditionalGroup === constraint.conditionalGroup &&
          existing.conditionalArm === constraint.conditionalArm
      )
    ) {
      continue;
    }
    combined.push(constraint);
  }
  return combined;
}

function assignmentTargetBase(node: TreeNode): TreeNode {
  let current = node;
  while (true) {
    if (
      current instanceof ASTNode.PostfixExpression ||
      current instanceof ASTNode.VariableIdentifier ||
      (current instanceof ASTNode.ExpressionAstNode && current.children.length === 1)
    ) {
      const child = current.children[0];
      if (child instanceof TreeNode) {
        current = child;
        continue;
      }
    } else if (current instanceof ASTNode.PrimaryExpression && current.children.length === 3) {
      const child = current.children[1];
      if (child instanceof TreeNode) {
        current = child;
        continue;
      }
    }
    return current;
  }
}
