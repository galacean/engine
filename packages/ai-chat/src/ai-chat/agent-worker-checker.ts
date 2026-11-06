import type { AgentApiDeclarationModule, AgentScriptError } from "./agent-types";

export interface AgentCheckRequest {
  id: number;
  source: string;
  declarations: readonly Pick<AgentApiDeclarationModule, "id" | "source">[];
}
export interface AgentScriptChecker {
  check(
    source: string,
    declarations: AgentCheckRequest["declarations"],
    signal: AbortSignal
  ): Promise<AgentScriptError | undefined>;
  dispose?(): void;
}

/** One reusable checker per AgentLoop, separate from disposable execution Workers. */
export class WorkerAgentScriptChecker implements AgentScriptChecker {
  private worker?: Worker;
  private serial = 0;
  private active?: (error: AgentScriptError) => void;
  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL("./AgentChecker.worker.ts", import.meta.url), { type: "module" })
  ) {}

  check(
    source: string,
    declarations: AgentCheckRequest["declarations"],
    signal: AbortSignal
  ): Promise<AgentScriptError | undefined> {
    if (this.active) throw new Error("Agent checker already has an active request");
    return new Promise((resolve) => {
      const id = ++this.serial;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: AgentScriptError) => {
        if (this.active !== finish) return;
        this.active = undefined;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        resolve(error);
      };
      const cancel = () => {
        this.stopWorker();
        finish({ code: "SCRIPT_CANCELLED", phase: "cancelled", message: "Agent Script check cancelled" });
      };
      const fail = (message: string) => {
        this.stopWorker();
        finish({ code: "SCRIPT_CHECK_UNAVAILABLE", phase: "check", message });
      };
      this.active = finish;
      if (signal.aborted) {
        cancel();
        return;
      }
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => fail("Agent Script checker exceeded 30000ms"), 30_000);
      try {
        this.worker ??= this.createWorker();
        this.worker.onmessage = ({ data }: MessageEvent<{ id: number; error?: AgentScriptError }>) => {
          if (data.id === id) finish(data.error);
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail(event.message || "Agent checker Worker failed");
        };
        this.worker.onmessageerror = () => fail("Invalid checker Worker message");
        this.worker.postMessage({ id, source, declarations } satisfies AgentCheckRequest);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  dispose(): void {
    this.stopWorker();
    this.active?.({ code: "SCRIPT_CANCELLED", phase: "cancelled", message: "Agent checker disposed" });
  }
  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }
}
