import {
  ASTNode,
  BaseToken,
  FnSymbol,
  isBranchReachable,
  ShaderClueIR,
  ShaderCoreInfo,
  TreeNode,
  type ShaderEntryPointInfo,
  type ShaderRange
} from "@galacean/engine-shader-parser/internal/verbose";

/**
 * Analyzer-only graph and reachability information derived from neutral shader IR.
 * @internal
 */
export class ShaderAnalysisInfo {
  /** References to the legacy single fragment output. */
  readonly glFragColorReferences: ShaderRange[] = [];

  /** References to the fragment output array, before indexed uses are filtered. */
  readonly glFragDataReferences: ShaderRange[] = [];

  private readonly _callGraph = new Map<ASTNode.FunctionDefinition, Set<ASTNode.FunctionDefinition>>();
  private readonly _writes = new Map<ASTNode.FunctionDefinition, Set<string>>();
  private readonly _functionsByName = new Map<string, ASTNode.FunctionDefinition[]>();

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
    const reachable = new Set<ASTNode.FunctionDefinition>();
    const pending = entry.functions.map((symbol) => symbol.astNode);
    while (pending.length) {
      const functionNode = pending.pop()!;
      if (reachable.has(functionNode)) continue;
      reachable.add(functionNode);
      for (const callee of this._callGraph.get(functionNode) ?? []) pending.push(callee);
    }
    return reachable;
  }

  /**
   * Checks whether an entry or a reachable helper writes a named value.
   * @param entry - Entry point whose call graph is inspected.
   * @param name - Leftmost identifier of the assignment target.
   * @returns Whether a reachable assignment writes the identifier.
   */
  hasReachableWrite(entry: ShaderEntryPointInfo, name: string): boolean {
    for (const functionNode of this.reachableFunctions(entry)) {
      if (this._writes.get(functionNode)?.has(name)) return true;
    }
    return false;
  }

  /**
   * Returns every parsed function declaration.
   * @returns Function identities retained by the neutral IR.
   */
  *functions(): IterableIterator<ASTNode.FunctionDefinition> {
    for (const functions of this._functionsByName.values()) yield* functions;
  }

  /**
   * Returns functions directly called by a function.
   * @param functionNode - Caller function identity.
   * @returns Direct callees.
   */
  calleesOf(functionNode: ASTNode.FunctionDefinition): ReadonlySet<ASTNode.FunctionDefinition> {
    return this._callGraph.get(functionNode) ?? emptyFunctions;
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
    for (const functions of this._functionsByName.values()) {
      for (const functionNode of functions) this._walkFunction(functionNode, functionNode.statements);
    }
  }

  private _walkFunction(functionNode: ASTNode.FunctionDefinition, node: TreeNode): void {
    if (!isBranchReachable(node._branch) || node instanceof ASTNode.MacroDefine) return;
    if (node instanceof ASTNode.FunctionCallGeneric) this._recordCall(functionNode, node);
    if (node instanceof ASTNode.VariableIdentifier) {
      const child = node.children[0];
      if (child instanceof BaseToken) {
        if (child.lexeme === "gl_FragColor") this.glFragColorReferences.push(node.location);
        else if (child.lexeme === "gl_FragData") this.glFragDataReferences.push(node.location);
      }
    }
    if (node instanceof ASTNode.AssignmentExpression && node.children.length === 3) {
      const lhs = node.children[0];
      if (lhs instanceof TreeNode) {
        const name = leftmostIdentifier(lhs);
        if (name) {
          const writes = this._writes.get(functionNode) ?? new Set<string>();
          writes.add(name);
          this._writes.set(functionNode, writes);
        }
      }
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._walkFunction(functionNode, child);
    }
  }

  private _recordCall(caller: ASTNode.FunctionDefinition, call: ASTNode.FunctionCallGeneric): void {
    if (!(call.fnSymbol instanceof FnSymbol)) return;
    const callees = this._callGraph.get(caller) ?? new Set<ASTNode.FunctionDefinition>();
    callees.add(call.fnSymbol.astNode);
    this._callGraph.set(caller, callees);
  }
}

const emptyFunctions: ReadonlySet<ASTNode.FunctionDefinition> = new Set();

function leftmostIdentifier(node: TreeNode): string | undefined {
  let current = node;
  while (true) {
    if (current instanceof ASTNode.VariableIdentifier) {
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
