import { AIChatSession, AgentTraceStore, type AgentEvent, type AgentInputPreparation,
  type AgentInputTarget, type AgentRunOptions, type AgentTraceAsr, type AgentValue } from "@galacean/engine-ai-chat/ai-chat/index";
import type { AgentSessionSnapshot } from "@galacean/engine-ai-chat/ai-chat/session-data";
import type { SeedWorldAgentApplication } from "../agent-adapter/SeedWorldAgentApplication.ts";

type InputTrace = { asr?: AgentTraceAsr; id?: string };
/** Session data owns execution lifetime; raw Agent events only enrich diagnostics. */
export class SeedWorldSessionActivity {
  private pendingTrace?: InputTrace;
  private readonly queuedTraces = new Map<string, InputTrace>();
  private executionId?: string;
  private traceId?: string;
  private releaseViewer?: () => void;
  private readonly unsubscribeEvents: () => void;
  private unsubscribeState?: () => void;
  constructor(private readonly session: AIChatSession, private readonly application: SeedWorldAgentApplication,
    readonly trace: AgentTraceStore) {
    this.unsubscribeEvents = session.subscribe(event => this.accept(event));
    this.unsubscribeState = session.subscribeState(snapshot => this.renderTrace(snapshot));
    if (session.state === "disposed") this.unsubscribeState();
  }
  submit(text: string, options: AgentRunOptions, target: AgentInputTarget, preparation: AgentInputPreparation, trace?: InputTrace) {
    this.pendingTrace = trace;
    try { return this.session.submit(text, options, target, preparation); }
    catch (error) {
      // Admission never established a Session execution. Close only this source's
      // ASR trace, without touching any accepted task or its result.
      if (trace?.id) {
        this.trace.updateActive(trace.id, { input: text, asr: trace.asr });
        this.trace.finish(trace.id, "failed", { error });
      }
      throw error;
    } finally { this.pendingTrace = undefined; }
  }
  private accept(event: AgentEvent): void {
    if (event.type === "input_queued" && this.pendingTrace) this.queuedTraces.set(event.input.id, this.pendingTrace);
    if (event.type === "task_started") this.setViewer(event.context);
    if (event.type === "input_consumed") this.setViewer(event.input.context);
    if (this.traceId) this.trace.captureAgentEvent(event);
  }
  private renderTrace(snapshot: AgentSessionSnapshot): void {
    const task = snapshot.current;
    if (task && task.id !== this.executionId && !task.outcome) {
      this.executionId = task.id;
      const source = this.queuedTraces.get(task.inputId);
      this.queuedTraces.delete(task.inputId);
      const update = { input: task.input, asr: source?.asr,
        worldBefore: this.trace.enabled ? readTraceWorldSnapshot(this.application) : undefined };
      this.traceId = this.trace.updateActive(source?.id, update) ? source?.id
        : this.trace.begin({ ...update, inputSource: task.inputSource });
    }
    if (task && task.id === this.executionId && this.traceId) {
      this.trace.updateActive(this.traceId, { session: {
        id: task.id, inputId: task.inputId, continuedFrom: task.continuedFrom,
        inputs: task.inputs.map(({ id, text, error }) => ({ id, text, error }))
      } });
    }
    if (task?.id === this.executionId && task?.outcome && (this.traceId || this.releaseViewer)) {
      this.releaseViewer?.(); this.releaseViewer = undefined;
      const { status, message } = task.outcome;
      this.trace.finish(this.traceId, status === "stopped" ? "cancelled" : status, {
        worldAfter: this.trace.enabled ? readTraceWorldSnapshot(this.application) : undefined,
        error: status === "failed" ? new Error(message) : undefined
      });
      this.traceId = undefined;
    }
    // Source metadata belongs only to inputs still waiting for consumption. A
    // failed supplement disappears from the inbox but is retained in task.inputs.
    const pending = new Set(snapshot.pendingInputs.map(entry => entry.input.id));
    for (const id of this.queuedTraces.keys()) if (!pending.has(id)) this.queuedTraces.delete(id);
    if (snapshot.state === "disposed") {
      this.queuedTraces.clear();
      this.unsubscribeEvents(); this.unsubscribeState?.();
    }
  }
  private setViewer(context: AgentValue | undefined): void {
    this.releaseViewer?.();
    const viewer = context && typeof context === "object" && !Array.isArray(context) ? (context as Record<string, AgentValue>).viewer_at_submission : undefined;
    this.releaseViewer = this.application.captureTaskViewerSnapshot(
      viewer as ReturnType<SeedWorldAgentApplication["getViewerSnapshot"]> | undefined);
  }
}
export function readTraceWorldSnapshot(application: SeedWorldAgentApplication): unknown {
  try {
    const context = application.getWorldContext();
    if (!context || typeof context !== "object" || Array.isArray(context)) return context;
    const value = context as Record<string, unknown>;
    return structuredClone({ world: value.world, camera: value.camera, authoring: value.authoring,
      lighting: value.lighting, environment: value.environment });
  } catch (error) { return { snapshotError: error instanceof Error ? error.message : String(error) }; }
}
