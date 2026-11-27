import {
  AgentCancelledError,
  getAgentTaskFailure,
  type AgentEvent
} from "@galacean/engine-ai-chat/ai-chat/index";
import type { SceneGenerationRunOptions } from "./SceneVisualIntentTransport.ts";

export type SceneGenerationEvent = AgentEvent | {
  type: "generation_model_finished"; traceId?: string; model?: string; durationMilliseconds: number;
};
export interface SceneGenerationSession {
  readonly running: boolean;
  run(input: string, options: SceneGenerationRunOptions): Promise<{ finalMessage: string }>;
  subscribe(listener: (event: SceneGenerationEvent) => void): () => void;
  cancel(): void;
}

export interface SceneVisualIntentMessage {
  role: "user" | "assistant";
  text: string;
  status: "pending" | "completed" | "failed" | "cancelled";
}
export interface SceneVisualIntentState {
  messages: SceneVisualIntentMessage[];
  busy: boolean;
  progress: string;
  sceneReady: boolean;
}

/** One input surface; the model chooses one plan and native authoring owns its execution. */
export class SceneVisualIntentController {
  private state: SceneVisualIntentState = { messages: [], busy: false, progress: "", sceneReady: false };
  private listeners = new Set<(state: SceneVisualIntentState) => void>();
  private disposed = false;
  private unsubscribe?: () => void;
  private session?: SceneGenerationSession;
  private cancelRequested = false;

  constructor(
    private prepareSession: () => Promise<SceneGenerationSession>,
    private options: SceneGenerationRunOptions,
    private onEvent?: (event: SceneGenerationEvent) => void
  ) {}

  getState = (): SceneVisualIntentState => structuredClone(this.state);
  subscribe = (listener: (state: SceneVisualIntentState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  submit = async (input: string): Promise<void> => {
    if (!input.trim() || this.disposed || this.state.busy || this.state.sceneReady || this.session?.running) return;
    this.state.messages.push({ role: "user", text: input, status: "completed" });
    const reply: SceneVisualIntentMessage = { role: "assistant", text: "", status: "pending" };
    this.state.messages.push(reply);
    this.state.busy = true;
    this.cancelRequested = false;
    this.state.progress = "正在理解你的描述…";
    this.emit();
    try {
      if (!this.session) {
        this.session = await this.prepareSession();
      }
      if (this.disposed || this.cancelRequested) throw new AgentCancelledError();
      if (!this.unsubscribe) {
        this.unsubscribe = this.session.subscribe(event => {
          this.onEvent?.(event);
          if (event.type === "model_started") this.state.progress = "正在理解你的描述…";
          if (event.type === "tool_started") this.state.progress = event.tool === "scene.generate"
            ? "正在首次生成 3D 场景…" : "正在准备生成方案…";
          if (event.type === "tool_finished" && event.tool === "scene.generate" && event.result.ok) this.state.sceneReady = true;
          this.emit();
        });
      }
      // Preserve the original instruction. There is no fixed brief, keyword mapping or proposal compiler.
      const result = await this.session.run(input, { ...this.options, inputSource: "text" });
      reply.text = result.finalMessage;
      reply.status = "completed";
    } catch (error) {
      reply.status = error instanceof AgentCancelledError ? "cancelled" : "failed";
      reply.text = reply.status === "cancelled" ? "本轮已停止，已完成的生成操作会保留。"
        : getAgentTaskFailure(error)?.message ?? (error instanceof Error ? error.message : String(error));
    } finally {
      this.state.busy = false;
      this.state.progress = "";
      this.emit();
    }
  };

  cancel = (): void => { this.cancelRequested = true; this.session?.cancel(); };
  markSceneReady = (): void => { this.state.sceneReady = true; this.emit(); };
  dispose = (): void => {
    this.disposed = true;
    this.cancel();
    this.unsubscribe?.();
    this.listeners.clear();
  };
  private emit(): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(this.getState());
  }
}
