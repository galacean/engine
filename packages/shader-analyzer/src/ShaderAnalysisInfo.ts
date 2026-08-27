import {
  ASTNode,
  BaseToken,
  canBranchesOverlap,
  EMPTY_BRANCH,
  FnSymbol,
  getBranchCoverage,
  getBranchReachability,
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
  private readonly _functionsByName = new Map<string, ASTNode.FunctionDefinition[]>();
  private readonly _reachablePathsByEntry = new Map<
    ShaderEntryPointInfo,
    ReadonlyMap<ASTNode.FunctionDefinition, readonly BranchSignature[]>
  >();
  private readonly _reachablePathsByFunction = new Map<
    FnSymbol,
    ReadonlyMap<ASTNode.FunctionDefinition, readonly BranchSignature[]>
  >();

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
  }

  /**
   * Finds every function reachable from an entry, including the entry declarations themselves.
   * @param entry - Entry point to traverse.
   * @returns Reachable function identities.
   */
  reachableFunctions(entry: ShaderEntryPointInfo): ReadonlySet<ASTNode.FunctionDefinition> {
    return new Set(this._getReachablePaths(entry).keys());
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
    const paths = this._getReachablePaths(entry).get(functionNode);
    if (!paths) return false;
    for (const path of paths) {
      const sitePath = combineBranches(path, branch);
      if (sitePath && getBranchReachability(sitePath) === "reachable") return true;
    }
    return false;
  }

  /**
   * Classifies whether every reachable entry configuration writes a source identifier or builtin semantic.
   * @param entry - Entry point whose call graph is inspected.
   * @param target - Leftmost source identifier or builtin semantic of the assignment target.
   * @returns Proven coverage, a proven missing-write configuration, or an unresolved complex condition.
   */
  getReachableWriteCoverage(entry: ShaderEntryPointInfo, target: string | ShaderBuiltinSemantic): BranchCoverage {
    if (!entry.functions.length) return "unknown";
    let result: BranchCoverage = "covered";
    for (const entryFunction of entry.functions) {
      const writePaths: BranchSignature[] = [];
      const budget = { remaining: MAX_CALL_PATH_STATES, exhausted: false };
      this._collectWritePaths(entryFunction.astNode, EMPTY_BRANCH, target, new Set(), writePaths, budget);
      if (budget.exhausted) return "unknown";
      if (!writePaths.length) return "uncovered";
      const coverage = getBranchCoverage(writePaths, entryFunction.branchSignature ?? EMPTY_BRANCH);
      if (coverage === "uncovered") return coverage;
      if (coverage === "unknown") result = coverage;
    }
    return result;
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
    let paths = this._reachablePathsByFunction.get(entryFunction);
    if (!paths) {
      paths = this._buildReachablePaths([entryFunction]);
      this._reachablePathsByFunction.set(entryFunction, paths);
    }
    const locations: ShaderRange[] = [];
    for (const reference of this._glFragColorReferences) {
      const functionPaths = paths.get(reference.functionNode);
      if (!functionPaths) continue;
      for (const path of functionPaths) {
        const sitePath = combineBranches(path, reference.branch);
        if (sitePath && getBranchReachability(sitePath) === "reachable") {
          locations.push(reference.location);
          break;
        }
      }
    }
    return locations;
  }

  /**
   * Finds a macro configuration in which one fragment entry can reach both legacy output forms.
   * @param entryFunction - Exact macro-alternative function selected as the fragment entry.
   * @returns The conflicting output ranges, or `undefined` when coexistence is disproven or unknown.
   */
  coexistingLegacyFragmentOutputsFrom(
    entryFunction: FnSymbol
  ): { output0: ShaderRange; outputArray: ShaderRange } | undefined {
    let paths = this._reachablePathsByFunction.get(entryFunction);
    if (!paths) {
      paths = this._buildReachablePaths([entryFunction]);
      this._reachablePathsByFunction.set(entryFunction, paths);
    }
    for (const output0 of this._glFragColorReferences) {
      const output0Paths = paths.get(output0.functionNode);
      if (!output0Paths) continue;
      for (const outputArray of this._glFragDataConditionalReferences) {
        const outputArrayPaths = paths.get(outputArray.functionNode);
        if (!outputArrayPaths) continue;
        for (const output0Path of output0Paths) {
          const output0Site = combineBranches(output0Path, output0.branch);
          if (!output0Site) continue;
          for (const outputArrayPath of outputArrayPaths) {
            const outputArraySite = combineBranches(outputArrayPath, outputArray.branch);
            if (!outputArraySite) continue;
            const combined = combineBranches(output0Site, outputArraySite);
            if (combined && getBranchReachability(combined) === "reachable") {
              return { output0: output0.location, outputArray: outputArray.location };
            }
          }
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
   * Finds mutually recursive call cycles that are satisfiable under one consistent macro
   * configuration. Unknown branch relations stay silent rather than becoming false diagnostics.
   * @returns Proven cycles of at least two distinct functions.
   */
  mutualRecursionCycles(): readonly (readonly ASTNode.FunctionDefinition[])[] {
    const cycles: ASTNode.FunctionDefinition[][] = [];
    const cycleKeys = new Set<string>();
    const budget = { remaining: MAX_CALL_PATH_STATES };
    for (const start of this.functions()) {
      if (budget.remaining <= 0) break;
      const startBranch = start.protoType.ident.branch;
      if (getBranchReachability(startBranch) !== "reachable") continue;
      this._collectMutualRecursionCycles(start, startBranch, [], new Set(), cycles, cycleKeys, budget);
    }
    return cycles;
  }

  private _indexFunctions(node: TreeNode): void {
    if (node instanceof ASTNode.FunctionDefinition) {
      const name = node.protoType.ident.lexeme;
      const functions = this._functionsByName.get(name) ?? [];
      functions.push(node);
      this._functionsByName.set(name, functions);
      return;
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._indexFunctions(child);
    }
  }

  private _indexFunctionBodies(): void {
    this._functionsByName.forEach((functions) => {
      for (const functionNode of functions) this._walkFunction(functionNode, functionNode.statements);
    });
  }

  private _walkFunction(functionNode: ASTNode.FunctionDefinition, node: TreeNode): void {
    if (!isBranchReachable(node._branch) || node instanceof ASTNode.MacroDefine) return;
    if (node instanceof ASTNode.FunctionCallGeneric) this._recordCall(functionNode, node);
    if (node instanceof ASTNode.VariableIdentifier) {
      if (node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutput0) {
        this._glFragColorReferences.push({ functionNode, location: node.location, branch: node._branch });
      } else if (node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray) {
        this.glFragDataReferences.push(node.location);
        this._glFragDataConditionalReferences.push({ functionNode, location: node.location, branch: node._branch });
      }
    }
    if (node instanceof ASTNode.AssignmentExpression && node.children.length === 3) {
      const lhs = node.children[0];
      if (lhs instanceof TreeNode) {
        const target = leftmostIdentifierTarget(lhs);
        if (target !== undefined) this._recordWrite(functionNode, target, node._branch);
      }
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._walkFunction(functionNode, child);
    }
  }

  private _recordCall(caller: ASTNode.FunctionDefinition, call: ASTNode.FunctionCallGeneric): void {
    const candidates = call.fnSymbols ?? (call.fnSymbol instanceof FnSymbol ? [call.fnSymbol] : []);
    if (!candidates.length) return;
    const facts = this._callFacts.get(caller) ?? [];
    for (const candidate of candidates) {
      facts.push({ callee: candidate.astNode, branch: call._branch });
      this._recordOutputParameterWrites(caller, call, candidate);
    }
    this._callFacts.set(caller, facts);
  }

  private _getReachablePaths(
    entry: ShaderEntryPointInfo
  ): ReadonlyMap<ASTNode.FunctionDefinition, readonly BranchSignature[]> {
    const cached = this._reachablePathsByEntry.get(entry);
    if (cached) return cached;

    const paths = this._buildReachablePaths(entry.functions);
    this._reachablePathsByEntry.set(entry, paths);
    return paths;
  }

  private _buildReachablePaths(
    entryFunctions: readonly FnSymbol[]
  ): ReadonlyMap<ASTNode.FunctionDefinition, readonly BranchSignature[]> {
    const paths = new Map<ASTNode.FunctionDefinition, BranchSignature[]>();
    const pending: ReachabilityState[] = [];
    for (const symbol of entryFunctions) {
      const branch = symbol.branchSignature ?? symbol.astNode.protoType.ident.branch;
      if (getBranchReachability(branch) === "reachable") pending.push({ functionNode: symbol.astNode, branch });
    }

    let remainingStates = MAX_CALL_PATH_STATES;
    while (pending.length && remainingStates-- > 0) {
      const state = pending.pop()!;
      const existingPaths = paths.get(state.functionNode) ?? [];
      if (existingPaths.some((existing) => sameBranch(existing, state.branch))) continue;
      existingPaths.push(state.branch);
      paths.set(state.functionNode, existingPaths);

      for (const call of this._callFacts.get(state.functionNode) ?? []) {
        const callPath = combineBranches(state.branch, call.branch);
        if (!callPath) continue;
        const calleePath = combineBranches(callPath, call.callee.protoType.ident.branch);
        if (calleePath && getBranchReachability(calleePath) === "reachable") {
          pending.push({ functionNode: call.callee, branch: calleePath });
        }
      }
    }
    return paths;
  }

  private _collectMutualRecursionCycles(
    functionNode: ASTNode.FunctionDefinition,
    incomingBranch: BranchSignature,
    stack: ASTNode.FunctionDefinition[],
    activeFunctions: Set<ASTNode.FunctionDefinition>,
    out: ASTNode.FunctionDefinition[][],
    cycleKeys: Set<string>,
    budget: { remaining: number }
  ): void {
    if (--budget.remaining < 0) return;
    stack.push(functionNode);
    activeFunctions.add(functionNode);
    for (const call of this._callFacts.get(functionNode) ?? []) {
      const callPath = combineBranches(incomingBranch, call.branch);
      if (!callPath) continue;
      const calleePath = combineBranches(callPath, call.callee.protoType.ident.branch);
      if (!calleePath || getBranchReachability(calleePath) !== "reachable") continue;
      if (activeFunctions.has(call.callee)) {
        const cycleStart = stack.indexOf(call.callee);
        const cycle = stack.slice(cycleStart);
        if (cycle.length < 2) continue;
        const key = canonicalCycleKey(cycle);
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          out.push(cycle);
        }
        continue;
      }
      this._collectMutualRecursionCycles(call.callee, calleePath, stack, activeFunctions, out, cycleKeys, budget);
    }
    activeFunctions.delete(functionNode);
    stack.pop();
  }

  private _recordOutputParameterWrites(
    caller: ASTNode.FunctionDefinition,
    call: ASTNode.FunctionCallGeneric,
    callee: FnSymbol
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
      const target = leftmostIdentifierTarget(argument);
      if (target === undefined) continue;
      const branch = combineBranches(call._branch, callee.branchSignature ?? EMPTY_BRANCH);
      if (branch) this._recordWrite(caller, target, branch);
    }
  }

  private _recordWrite(
    functionNode: ASTNode.FunctionDefinition,
    target: string | ShaderBuiltinSemantic,
    branch: BranchSignature
  ): void {
    const writes = this._writes.get(functionNode) ?? [];
    writes.push({ target, branch });
    this._writes.set(functionNode, writes);
  }

  private _collectWritePaths(
    functionNode: ASTNode.FunctionDefinition,
    incomingBranch: BranchSignature,
    target: string | ShaderBuiltinSemantic,
    activeFunctions: Set<ASTNode.FunctionDefinition>,
    out: BranchSignature[],
    budget: { remaining: number; exhausted: boolean }
  ): void {
    if (budget.remaining-- <= 0) {
      budget.exhausted = true;
      return;
    }
    const functionBranch = functionNode.protoType.ident.branch;
    const reachableBranch = combineBranches(incomingBranch, functionBranch);
    if (!reachableBranch || activeFunctions.has(functionNode)) return;
    activeFunctions.add(functionNode);

    for (const write of this._writes.get(functionNode) ?? []) {
      if (write.target !== target) continue;
      const writeBranch = combineBranches(reachableBranch, write.branch);
      if (writeBranch) out.push(writeBranch);
    }
    for (const call of this._callFacts.get(functionNode) ?? []) {
      const callBranch = combineBranches(reachableBranch, call.branch);
      if (callBranch) this._collectWritePaths(call.callee, callBranch, target, activeFunctions, out, budget);
    }
    activeFunctions.delete(functionNode);
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

interface ReachabilityState {
  readonly functionNode: ASTNode.FunctionDefinition;
  readonly branch: BranchSignature;
}

// Each edge adds constraints, so a repeated state cannot reveal a more permissive path. Bound the
// retained alternatives before adversarial macro graphs turn diagnostics into exponential work.
const MAX_CALL_PATH_STATES = 256;

function canonicalCycleKey(cycle: readonly ASTNode.FunctionDefinition[]): string {
  const identities = cycle.map((fn) => `${fn.protoType.ident.lexeme}@${fn.protoType.ident.location.start.index}`);
  let first = 0;
  for (let i = 1; i < identities.length; i++) {
    if (identities[i] < identities[first]) first = i;
  }
  return identities.slice(first).concat(identities.slice(0, first)).join("->");
}

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

function leftmostIdentifierTarget(node: TreeNode): string | ShaderBuiltinSemantic | undefined {
  let current = node;
  while (true) {
    if (current instanceof ASTNode.VariableIdentifier) {
      if (current.builtinSemantic !== undefined) return current.builtinSemantic;
      const child = current.children[0];
      return child instanceof BaseToken ? child.lexeme : undefined;
    }
    if (current instanceof ASTNode.PostfixExpression && current.children.length) {
      const base = current.children[0];
      if (!(base instanceof TreeNode)) return undefined;
      current = base;
      continue;
    }
    if (current instanceof ASTNode.ExpressionAstNode && current.children.length === 1) {
      const child = current.children[0];
      if (!(child instanceof TreeNode)) return undefined;
      current = child;
      continue;
    }
    return undefined;
  }
}
