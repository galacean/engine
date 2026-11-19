import { RuntimeScriptPreparationError } from "./runtime-script-errors";
import type { CompiledRuntimeScripts } from "./runtime-script-compiler";

const IDLE_TERMINATE_MS = 1000;

/** Reusable compiler Worker owned by a runtime project session. */
export class RuntimeScriptWorker {
  private worker?: Worker;
  private serial = 0;
  private active?: (error: Error) => void;
  private idleTimer?: ReturnType<typeof setTimeout>;

  private clearIdleTimer(): void {
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private scheduleIdleTerminate(): void {
    this.clearIdleTimer();
    if (!this.worker || this.active) return;
    const timer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.active) return;
      this.worker?.terminate();
      this.worker = undefined;
    }, IDLE_TERMINATE_MS);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
    this.idleTimer = timer;
  }

  compile(
    sources: Record<string, string>,
    signal?: AbortSignal,
    entries?: readonly string[],
    analyzeOnly = false,
    externals: Record<string, string[]> = {},
    declarations: Record<string, string> = {}
  ): Promise<CompiledRuntimeScripts> {
    if (this.active) return Promise.reject(new Error("Runtime script compilation is already active"));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Runtime script compilation cancelled"));
    this.clearIdleTimer();
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        this.active = undefined;
        this.scheduleIdleTerminate();
      };
      const fail = (error: Error) => {
        this.worker?.terminate();
        this.worker = undefined;
        cleanup();
        reject(error);
      };
      const cancel = () => fail(new Error("Runtime script compilation cancelled"));
      this.active = fail;
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => fail(new Error("Runtime script compilation exceeded 30000ms")), 30_000);
      try {
        this.worker ??= new Worker(new URL("./RuntimeScriptCompiler.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = ({
          data
        }: MessageEvent<{ id: number; error?: string; phase?: "check" | "build"; result: CompiledRuntimeScripts }>) => {
          if (data.id !== id || this.active !== fail) return;
          cleanup();
          if (data.error) reject(new RuntimeScriptPreparationError(data.phase ?? "build", data.error));
          else resolve(data.result);
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail(new Error(event.message || "Runtime compiler failed"));
        };
        this.worker.onmessageerror = () => fail(new Error("Invalid runtime compiler response"));
        this.worker.postMessage({ id, sources, entries, analyzeOnly, externals, declarations });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  dispose(): void {
    this.clearIdleTimer();
    if (this.active) this.active(new Error("Runtime compiler disposed"));
    else {
      this.worker?.terminate();
      this.worker = undefined;
    }
  }
}
