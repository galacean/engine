import { AgentCancelledError, AgentLoop, getAgentTaskFailure } from "./agent-loop";
import { SessionData, type AgentSessionSnapshot } from "./session-data";
import { ConversationHistory } from "./conversation-history";
import type {
  AgentContinuation,
  AgentEvent,
  AgentEventListener,
  AgentInputTarget,
  AgentRunOptions,
  AgentSessionState,
  AgentTaskResult,
  AgentUserInput,
  AgentViewObservation
} from "./agent-types";

export type AIChatSessionOptions = { agent: AgentLoop; history?: ConversationHistory };
/** Host-owned preparation. Session takes ownership on submit, including rejected submissions.
 * Never cloned into Worker input or message history. prepare may be retried after stop/continue.
 */
export type AgentInputPreparation = {
  prepare(signal: AbortSignal): Promise<readonly AgentViewObservation[]>;
  release(): void;
};
export type AIChatSubmission = { id: string; completion: Promise<AgentTaskResult> };
type PendingInput = {
  input: AgentUserInput;
  target: AgentInputTarget;
  options: AgentRunOptions;
  preparation?: AgentInputPreparation;
  prepared: boolean;
  completion: Promise<AgentTaskResult>;
  resolve(result: AgentTaskResult): void;
  reject(error: unknown): void;
};
type Resume = { turn: SuspendedTurn; waiter: PendingInput };
type Machine =
  | { kind: "idle" | "preparing" | "executing" }
  | { kind: "stopping"; restart: boolean; suspended?: SuspendedTurn }
  | { kind: "stopped"; suspended?: SuspendedTurn }
  | { kind: "disposed" };
type SuspendedTurn = { initial: PendingInput; continuation: AgentContinuation; blocked: boolean };

/** One driver owns the inbox and all turn transitions, including stop/continue. */
export class AIChatSession {
  readonly #agent: AgentLoop;
  readonly #history: ConversationHistory;
  readonly #listeners = new Set<AgentEventListener>();
  readonly #unsubscribe: () => void;
  readonly #inbox: PendingInput[] = [];
  #active?: {
    initial: PendingInput;
    waiters: PendingInput[];
    preparation?: { entry: PendingInput; controller: AbortController };
  };
  #modelRoute: string | null = null;
  #machine: Machine = { kind: "idle" };
  // Physical cancellation barrier only; admission and UI state come from the machine.
  #driver?: Promise<void>;
  readonly #data = new SessionData();
  #publication = 0;
  readonly #stateListeners = new Set<(snapshot: AgentSessionSnapshot) => void>();

  constructor(options: AIChatSessionOptions) {
    this.#agent = options.agent;
    this.#history = options.history ?? new ConversationHistory();
    this.#unsubscribe = this.#agent.subscribe((event) => {
      const changed = this.#data.accept(event);
      if (event.type === "model_recovery" && !changed) return;
      this.#emit(event.type === "task_started" ? { ...event, inputId: this.#active?.initial.input.id } : event);
      if (changed) this.#publish();
    });
  }

  get running(): boolean {
    return this.state === "preparing" || this.state === "executing" || this.state === "stopping";
  }
  get state(): AgentSessionState {
    return this.#machine.kind;
  }
  get canStop(): boolean {
    return this.state === "preparing" || this.state === "executing";
  }
  get canContinue(): boolean {
    return (
      this.#machine.kind === "stopped" &&
      !this.#machine.suspended?.blocked &&
      Boolean(this.#machine.suspended || this.#inbox.length)
    );
  }
  get continuationBlocked(): boolean {
    return (
      (this.#machine.kind === "stopped" || this.#machine.kind === "stopping") && !!this.#machine.suspended?.blocked
    );
  }
  get snapshot(): AgentSessionSnapshot {
    return this.#data.snapshot(this.state, this.canContinue, this.continuationBlocked, this.pendingInputs);
  }
  /** A view may subscribe at any time; no event replay is required to reconstruct it. */
  subscribeState(listener: (snapshot: AgentSessionSnapshot) => void): () => void {
    this.#stateListeners.add(listener);
    listener(this.snapshot);
    return () => this.#stateListeners.delete(listener);
  }
  get #halted(): boolean {
    return this.state === "stopping" || this.state === "stopped" || this.state === "disposed";
  }
  get historyRecordCount(): number {
    return this.#history.historyRecordCount;
  }
  get pendingInputs(): readonly { input: AgentUserInput; target: AgentInputTarget }[] {
    return this.#inbox.map(({ input, target }) => ({ input: structuredClone(input), target }));
  }

  getContextRecordCount(model?: string): number {
    return this.#modelRoute !== null && this.#modelRoute !== normalizeModelRoute(model)
      ? 0
      : this.#history.historyRecordCount;
  }

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Default input steers the live turn; an idle session starts a turn. */
  submit(
    text: string,
    options: AgentRunOptions = {},
    target: AgentInputTarget = "next-step",
    preparation?: AgentInputPreparation
  ): AIChatSubmission {
    try {
      return this.#submit(text, options, target, preparation);
    } catch (error) {
      preparation?.release();
      throw error;
    }
  }

  #submit(
    text: string,
    options: AgentRunOptions,
    target: AgentInputTarget,
    preparation?: AgentInputPreparation
  ): AIChatSubmission {
    if (this.state === "disposed") throw new Error("AIChatSession is disposed");
    if (!text.trim()) throw new Error("Agent task input cannot be empty");
    if (this.#inbox.length >= 64) throw new Error("AIChatSession input queue is full");
    if (target !== "next-step" && target !== "next-turn") throw new Error("Invalid input target");
    const startingAfterStop = this.#halted;
    const owner = startingAfterStop
      ? this.#machine.kind === "stopping" && this.#machine.restart
        ? this.#inbox[0]
        : undefined
      : this.#active && this.#data.current?.outcome
        ? undefined
        : (this.#active?.initial ?? this.#inbox[0]);
    if (
      target === "next-step" &&
      owner &&
      options.model !== undefined &&
      normalizeModelRoute(options.model) !== normalizeModelRoute(owner.options.model)
    ) {
      throw new Error("Cannot change model while supplementing a task; queue a next-turn input instead");
    }
    const pendingOptions =
      target === "next-step" && owner && options.model === undefined
        ? { ...options, model: owner.options.model }
        : options;
    const pending = createPending(text, pendingOptions, target, preparation);
    if (startingAfterStop && !(this.#machine.kind === "stopping" && this.#machine.restart)) {
      // Unconsumed steering belongs to the stopped turn. Explicit next-turn
      // requests retain FIFO order, after this newly requested turn.
      for (const entry of [...this.#inbox]) {
        if (entry.target === "next-step") this.removeInput(entry.input.id);
      }
      if (target === "next-turn") this.#inbox.push(pending);
      else this.#inbox.unshift(pending);
      if (this.#machine.kind === "stopping") this.#transition({ ...this.#machine, restart: true });
    } else {
      this.#inbox.push(pending);
    }
    this.#emit({ type: "input_queued", input: structuredClone(pending.input), target });
    this.#publish();
    this.#wake(undefined, startingAfterStop);
    return { id: pending.input.id, completion: pending.completion };
  }

  run(
    input: string,
    options: AgentRunOptions = {},
    target: AgentInputTarget = "next-step",
    preparation?: AgentInputPreparation
  ): Promise<AgentTaskResult> {
    try {
      return this.submit(input, options, target, preparation).completion;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  removeInput(id: string): boolean {
    const index = this.#inbox.findIndex((item) => item.input.id === id);
    if (index < 0) return false;
    const [removed] = this.#inbox.splice(index, 1);
    if (this.#active?.preparation?.entry === removed) this.#active?.preparation.controller.abort();
    removed.reject(new QueuedInputRemovedError());
    releasePreparation(removed);
    this.#emit({ type: "input_removed", inputId: id });
    this.#publish();
    return true;
  }

  /** Stops admission immediately. Queued inputs stay pending until continue or a new submission. */
  cancel(): void {
    if (this.state === "disposed" || this.state === "stopped") return;
    if (this.#machine.kind === "stopping") {
      if (this.#machine.restart) this.#transition({ ...this.#machine, restart: false });
      return;
    }
    this.#transition(this.#driver ? { kind: "stopping", restart: false } : { kind: "stopped" });
    this.#active?.preparation?.controller.abort();
    this.#agent.cancel();
  }

  async stop(): Promise<void> {
    this.cancel();
    await this.#driver;
  }

  /** Waits for the stop barrier, then acknowledges admission. Task failure belongs to
   * snapshot.current.outcome and the receipt's completion, never to admission.
   * id identifies the original input; continuing does not create a new input/turn.
   */
  async continue(): Promise<AIChatSubmission> {
    if (this.state === "stopping") await this.#driver;
    if (this.#machine.kind !== "stopped" || !this.canContinue || this.#driver) {
      throw new Error(
        this.continuationBlocked
          ? "An operation has an unknown outcome; inspect its host receipt before continuing"
          : "No stopped task or queued input is available to continue"
      );
    }
    const suspended = this.#machine.suspended;
    const resume = suspended
      ? { turn: suspended, waiter: createPending(suspended.initial.input.text, suspended.initial.options, "next-step") }
      : undefined;
    const input = suspended?.initial ?? this.#inbox[0];
    const completion = resume?.waiter.completion ?? input.completion;
    this.#wake(resume, true);
    return { id: input.input.id, completion };
  }

  reset(): void {
    if (this.#driver) throw new Error("Cannot reset AIChatSession while a task is running");
    if (this.state === "disposed") throw new Error("AIChatSession is disposed");
    for (const entry of [...this.#inbox]) this.removeInput(entry.input.id);
    this.#history.reset();
    this.#data.clear();
    this.#agent.resetKnowledge();
    this.#agent.resetConversationImages();
    this.#modelRoute = null;
    this.#transition({ kind: "idle" });
  }

  dispose(): void {
    if (this.state === "disposed") return;
    // Publish the terminal result before observers detach on disposal. Late work
    // may release resources, but cannot replace this execution outcome.
    this.#data.settleStopped();
    this.#transition({ kind: "disposed" });
    this.#active?.preparation?.controller.abort();
    this.#agent.cancel();
    for (const entry of [...this.#inbox]) this.removeInput(entry.input.id);
    this.#unsubscribe();
    this.#listeners.clear();
    this.#stateListeners.clear();
    this.#agent.resetConversationImages();
  }

  #wake(resume?: Resume, startStopped = false): void {
    if (
      (this.state !== "idle" && !(startStopped && this.state === "stopped")) ||
      this.#driver ||
      (!resume && !this.#inbox.length)
    )
      return;
    let settled!: () => void;
    this.#driver = new Promise<void>((resolve) => {
      settled = resolve;
    });
    // Reserve the driver before any observer or application code can submit again.
    void this.#drain(resume, startStopped).finally(() => {
      this.#driver = undefined;
      if (this.#machine.kind === "stopping") {
        const stopped = this.#machine;
        this.#transition(stopped.restart ? { kind: "idle" } : { kind: "stopped", suspended: stopped.suspended });
      } else if (this.state !== "disposed") this.#transition({ kind: "idle" });
      settled();
      this.#wake();
    });
  }

  async #drain(pendingResume?: Resume, startStopped = false): Promise<void> {
    while ((startStopped || !this.#halted) && (pendingResume || this.#inbox.length)) {
      startStopped = false;
      const resume = pendingResume;
      pendingResume = undefined;
      const initial = resume?.turn.initial ?? this.#inbox[0]!;
      const active = { initial, waiters: [resume?.waiter ?? initial] };
      this.#active = active;
      const previous = this.#data.current;
      const continuedFrom =
        previous?.inputId === initial.input.id && previous.outcome?.status === "stopped" ? previous.id : undefined;
      this.#data.begin(initial.input, initial.options, this.#history.historyRecordCount, continuedFrom);
      this.#transition({ kind: !resume && !initial.prepared ? "preparing" : "executing" });
      let continuation: AgentContinuation | undefined = resume?.turn.continuation;
      try {
        if (!resume) {
          try {
            if (!initial.prepared) await this.#prepare(initial);
          } catch (error) {
            if (this.#halted) break;
            if (!this.#inbox.includes(initial)) continue;
            throw error;
          }
          if (this.#halted) break;
          if (!this.#inbox.includes(initial)) continue;
        }
        if (!this.#halted && this.state !== "executing") this.#transition({ kind: "executing" });
        if (this.#halted) {
          if (!resume) break;
          throw new AgentCancelledError();
        }
        if (!resume) {
          if (!this.#inbox.includes(initial)) continue;
          this.#inbox.splice(this.#inbox.indexOf(initial), 1);
        }
        const modelRoute = normalizeModelRoute(initial.options.model);
        if (this.#modelRoute !== null && this.#modelRoute !== modelRoute) {
          this.#history.reset();
          this.#agent.resetKnowledge();
          this.#agent.resetConversationImages();
        }
        this.#modelRoute = modelRoute;
        if (!resume) this.#agent.beginConversationTurn(this.#history.beginTurn());
        const result = await this.#agent.run(initial.input.text, initial.options, this.#history.snapshot(), {
          initialInputId: initial.input.id,
          continuation: resume?.turn.continuation,
          takeInputs: async () => {
            const batch: PendingInput[] = [];
            for (const item of this.#inbox.filter((item) => item.target === "next-step")) {
              if (this.#halted) break;
              try {
                if (!item.prepared) await this.#prepare(item);
              } catch (error) {
                if (this.#halted) break;
                if (this.#inbox.includes(item)) {
                  this.#inbox.splice(this.#inbox.indexOf(item), 1);
                  this.#data.rejectInput(item.input, error);
                  item.reject(error);
                  releasePreparation(item);
                  this.#publish();
                }
                continue;
              } finally {
                if (!this.#halted) this.#transition({ kind: "executing" });
              }
              if (this.#halted) break;
              if (!this.#inbox.includes(item)) continue;
              batch.push(item);
            }
            if (this.#halted) return [];
            const ready = batch.filter((item) => this.#inbox.includes(item));
            for (const item of ready) this.#inbox.splice(this.#inbox.indexOf(item), 1);
            active.waiters.push(...ready);
            return ready.map((item) => structuredClone({ ...item.input, attachments: item.options.attachments }));
          },
          hasPendingInputs: () => this.#inbox.some((item) => item.target === "next-step"),
          saveContinuation: (value) => {
            continuation = value;
          }
        });
        this.#history.commit(result);
        for (const waiter of active.waiters) waiter.resolve(result);
      } catch (error) {
        const index = this.#inbox.indexOf(initial);
        if (index >= 0) this.#inbox.splice(index, 1);
        const failure = getAgentTaskFailure(error);
        if (failure) this.#history.commitFailure(failure);
        const suspended = continuation
          ? {
              initial: { ...initial, preparation: undefined, options: { ...initial.options, attachments: undefined } },
              continuation,
              blocked: continuation.stageResults.some(
                (stage) =>
                  stage.receipt?.status === "publication_failed" ||
                  stage.receipt?.commands?.some((command) => command.status === "unknown")
              )
            }
          : undefined;
        this.#data.fail(error, error instanceof AgentCancelledError);
        if (this.state !== "disposed")
          this.#transition({
            kind: "stopping",
            restart: this.#machine.kind === "stopping" && this.#machine.restart,
            suspended
          });
        for (const waiter of active.waiters) waiter.reject(error);
      } finally {
        if (this.#halted) this.#data.settleStopped();
        else if (!this.#inbox.includes(initial) && !this.#data.current?.outcome)
          this.#data.fail(new QueuedInputRemovedError(), true);
        for (const entry of active.waiters) {
          if (!this.#inbox.includes(entry)) releasePreparation(entry);
        }
        this.#active = undefined;
        // Removal and a stopped preparation may have no AgentLoop terminal event.
        // Publish their settled data before starting another execution.
        if (this.state !== "disposed") this.#publish();
      }
    }
  }

  async #prepare(entry: PendingInput): Promise<void> {
    if (entry.prepared) return;
    if (this.#halted) throw new AgentCancelledError();
    const controller = new AbortController();
    const active = this.#active!;
    const pending = (active.preparation = { entry, controller });
    this.#transition({ kind: "preparing" });
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new AgentCancelledError());
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      if (this.#halted) throw new AgentCancelledError();
      // Stop need not wait for a GPU fence. The producer retains its in-flight lease
      // until export settles; only this input's admission is cancelled here.
      const observations = await Promise.race([entry.preparation!.prepare(controller.signal), cancelled]);
      controller.signal.throwIfAborted();
      entry.options.attachments = structuredClone(observations);
      entry.prepared = true;
    } finally {
      controller.signal.removeEventListener("abort", abort);
      if (active.preparation === pending) active.preparation = undefined;
    }
  }

  #transition(next: Machine): void {
    const allowed: Record<AgentSessionState, readonly AgentSessionState[]> = {
      idle: ["idle", "preparing", "executing", "stopped", "disposed"],
      preparing: ["preparing", "executing", "stopping", "idle", "disposed"],
      executing: ["executing", "preparing", "stopping", "idle", "disposed"],
      stopping: ["stopping", "stopped", "idle", "disposed"],
      stopped: ["idle", "preparing", "executing", "stopped", "disposed"],
      disposed: []
    };
    if (!allowed[this.state].includes(next.kind))
      throw new Error(`Invalid Session transition: ${this.state} -> ${next.kind}`);
    this.#machine = next;
    this.#emit({ type: "session_state", state: this.state, canContinue: this.canContinue });
    this.#publish();
  }

  #publish(): void {
    if (!this.#stateListeners.size) return;
    const publication = ++this.#publication;
    const snapshot = this.snapshot;
    for (const listener of this.#stateListeners) {
      if (publication !== this.#publication) break;
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[AIChatSession] view failed", error);
      }
    }
  }

  #emit(event: AgentEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[AIChatSession] observer failed", error);
      }
    }
  }
}

/** Removing pending work is an intentional cancellation, not a task failure. */
class QueuedInputRemovedError extends AgentCancelledError {
  constructor() {
    super();
    this.name = "QueuedInputRemovedError";
    this.message = "Queued input removed";
  }
}

function createPending(
  text: string,
  options: AgentRunOptions,
  target: AgentInputTarget,
  preparation?: AgentInputPreparation
): PendingInput {
  let resolve!: PendingInput["resolve"];
  let reject!: PendingInput["reject"];
  const completion = new Promise<AgentTaskResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Submission receipts can be observed via events without awaiting completion.
  void completion.catch(() => undefined);
  const snapshot = structuredClone(options);
  return {
    input: {
      id: crypto.randomUUID(),
      text: text.trim(),
      inputSource: snapshot.inputSource ?? "text",
      context: snapshot.context
    },
    options: snapshot,
    preparation,
    prepared: !preparation,
    target,
    completion,
    resolve,
    reject
  };
}

function normalizeModelRoute(model?: string): string {
  return model?.trim() || "<default>";
}

function releasePreparation(entry: PendingInput): void {
  const source = entry.preparation;
  entry.preparation = undefined;
  source?.release();
}
