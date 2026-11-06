/** The result of one behavior evaluation. */
export type BehaviorStatus = "success" | "failure" | "running";

/** Named condition or action arguments stored in behavior configuration. */
export interface BehaviorReference {
  /** Registry key. */
  name: string;
  /** Serializable arguments interpreted by the registered capability. */
  params?: Record<string, unknown>;
}

/** Serializable behavior composition. Sequence actions retain their progress until reset. */
export type BehaviorNode =
  | ({ type: "action" | "condition" } & BehaviorReference)
  | { type: "sequence"; children: BehaviorNode[] }
  | { type: "selector"; reactive?: boolean; children: BehaviorNode[] }
  | { type: "weightedRandom"; children: { weight: number; when?: BehaviorReference; node: BehaviorNode }[] };

/** One execution of an asynchronous capability; a new instance is created on each activation. */
export interface BehaviorAction {
  /** Starts the capability exactly once. */
  start(): BehaviorStatus;
  /** Reads completion after an external event wakes the tree; must not restart the capability. */
  update(): BehaviorStatus;
  /** Releases active work when its branch is interrupted. */
  cancel(): void;
}

/** Host capabilities and shared facts used by a behavior instance. */
export interface BehaviorTreeOptions<C> {
  /** Mutable host facts; updates become visible at the next wake. */
  context: C;
  /** Factories receive a wake callback for animation, movement, and timer completion events. */
  actions: Record<string, (context: C, params: Record<string, unknown>, wake: () => void) => BehaviorAction>;
  /** Synchronous, side-effect-free predicates. */
  conditions: Record<string, (context: C, params: Record<string, unknown>) => boolean>;
  /** Random sample in [0, 1); injectable for reproducible behavior. */
  random?: () => number;
  /** Optional host queue. When supplied, wakes request a later tick instead of evaluating inline. */
  scheduleWake?: () => void;
}

interface Execution {
  index: number;
  result?: BehaviorStatus;
  action?: BehaviorAction;
}

/**
 * Event-driven behavior executor without an animation or update-loop dependency.
 * Reactive selectors recheck leading condition guards of sequence branches and cancel
 * the previous branch before starting a replacement action. Terminal results latch until halt.
 */
export class BehaviorTree<C> {
  private readonly _states = new Map<BehaviorNode, Execution>();
  private _evaluating = false;
  private _pending = false;
  private _status: BehaviorStatus = "running";
  private _generation = 0;

  /**
   * Validates and owns a tree configuration; do not mutate it during execution.
   * @param root - Root configuration. Reused node objects and cycles are rejected.
   * @param options - Host context, registered capabilities and randomness.
   * @throws If configuration references an unknown capability or invalid weight.
   */
  constructor(
    private readonly root: BehaviorNode,
    private readonly options: BehaviorTreeOptions<C>
  ) {
    this._validate(root, new Set());
  }

  /** Current result, retained after completion until halt resets the tree. */
  get status(): BehaviorStatus {
    return this._status;
  }

  /**
   * Starts or resumes evaluation. Reentrant wakes are coalesced into at most one extra pass.
   * @returns Current execution result.
   */
  tick(): BehaviorStatus {
    if (this._evaluating) {
      this._pending = true;
      return this._status;
    }
    if (this._status !== "running") return this._status;
    this._evaluating = true;
    try {
      for (let pass = 0; pass < 2; pass++) {
        this._pending = false;
        const generation = this._generation;
        const result = this._tick(this.root);
        if (generation !== this._generation) break;
        this._status = result;
        if (!this._pending || result !== "running") break;
      }
    } finally {
      this._evaluating = false;
    }
    return this._status;
  }

  /** Requests execution after a host event, through the optional host queue or an immediate tick. */
  wake(): BehaviorStatus {
    if (this.options.scheduleWake) {
      this.options.scheduleWake();
      return this._status;
    }
    return this.tick();
  }

  /** Cancels running actions, invalidates their callbacks, and resets execution for reuse. */
  halt(): void {
    this._generation++;
    this._reset(this.root);
    this._status = "running";
    this._pending = false;
  }

  private _tick(node: BehaviorNode, beforeStart?: () => void): BehaviorStatus {
    let state = this._states.get(node);
    if (!state) {
      state = { index: node.type === "weightedRandom" ? -1 : 0 };
      this._states.set(node, state);
    }
    if (state.result && state.result !== "running") return state.result;
    let result: BehaviorStatus;
    switch (node.type) {
      case "condition":
        result = this._condition(node) ? "success" : "failure";
        break;
      case "action":
        if (!state.action) {
          beforeStart?.();
          const generation = this._generation;
          const execution = state;
          state.action = this.options.actions[node.name](this.options.context, node.params ?? {}, () => {
            if (generation === this._generation && this._states.get(node) === execution) this.wake();
          });
          result = state.action.start();
        } else result = state.action.update();
        break;
      case "sequence":
        result = "success";
        while (state.index < node.children.length) {
          result = this._tick(node.children[state.index], beforeStart);
          if (result !== "success") break;
          state.index++;
        }
        break;
      case "selector": {
        const previous = state.index;
        let index = node.reactive ? 0 : previous;
        result = "failure";
        for (; index < node.children.length; index++) {
          const child = node.children[index];
          if (node.reactive && !this._guardsPass(child)) {
            this._reset(child);
            continue;
          }
          // Failed higher-priority branches must be eligible again after a fact changes.
          if (node.reactive && this._states.get(child)?.result === "failure") this._reset(child);
          const releasePrevious = () => {
            beforeStart?.();
            if (previous !== index && previous < node.children.length) this._reset(node.children[previous]);
          };
          result = this._tick(child, releasePrevious);
          if (result !== "failure") {
            releasePrevious();
            break;
          }
        }
        state.index = index;
        break;
      }
      case "weightedRandom": {
        if (state.index < 0) {
          const eligible = node.children
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.weight > 0 && (!entry.when || this._condition(entry.when)));
          const total = eligible.reduce((sum, item) => sum + item.entry.weight, 0);
          let sample = (this.options.random ?? Math.random)() * total;
          for (const item of eligible) {
            state.index = item.index;
            sample -= item.entry.weight;
            if (sample < 0) break;
          }
        }
        result = state.index < 0 ? "failure" : this._tick(node.children[state.index].node, beforeStart);
        break;
      }
    }
    state.result = result;
    return result;
  }

  private _condition(reference: BehaviorReference): boolean {
    return this.options.conditions[reference.name](this.options.context, reference.params ?? {});
  }

  private _guardsPass(node: BehaviorNode): boolean {
    if (node.type === "condition") return this._condition(node);
    if (node.type !== "sequence") return true;
    for (const child of node.children) {
      if (child.type !== "condition") break;
      if (!this._condition(child)) return false;
    }
    return true;
  }

  private _reset(node: BehaviorNode): void {
    const state = this._states.get(node);
    // Detach before cancel, so synchronous cancellation events cannot revive this execution.
    this._states.delete(node);
    if ("children" in node) {
      for (const child of node.children) this._reset("node" in child ? child.node : child);
    }
    if (state?.action && state.result === "running") state.action.cancel();
  }

  private _validate(node: BehaviorNode, seen: Set<BehaviorNode>): void {
    if (seen.has(node)) throw new Error("Behavior configuration must be a tree without shared node objects");
    seen.add(node);
    if (node.type === "action" || node.type === "condition") {
      const registry = node.type === "action" ? this.options.actions : this.options.conditions;
      if (typeof registry[node.name] !== "function") throw new Error(`Unknown behavior ${node.type}: ${node.name}`);
    } else if (node.type === "weightedRandom") {
      for (const child of node.children) {
        if (!Number.isFinite(child.weight) || child.weight < 0)
          throw new Error("Behavior weight must be finite and non-negative");
        if (child.when && typeof this.options.conditions[child.when.name] !== "function")
          throw new Error(`Unknown behavior condition: ${child.when.name}`);
        this._validate(child.node, seen);
      }
    } else if (node.type === "sequence" || node.type === "selector") {
      for (const child of node.children) this._validate(child, seen);
    } else throw new Error("Unknown behavior node type");
  }
}
