import { SEARCH_LIMITS } from "./project-search-contract";
import type { RegexHit, RegexReply, RegexRequest } from "./project-regex-protocol";

export class ProjectRegexWorkerError extends Error {}

/** One operation owns one Worker. Only one bounded chunk can be in flight.
 * Providers stay on the host; terminating a timed-out matcher never mutates VFS. */
export class ProjectRegexClient {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private pending?: { resolve: (hits: RegexHit[]) => void; reject: (error: unknown) => void };
  private rejectReady!: (error: unknown) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(
    private readonly signal: AbortSignal,
    private readonly timeout: () => void
  ) {
    signal.throwIfAborted();
    this.worker = new Worker(new URL("./ProjectRegex.worker.ts", import.meta.url), { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.worker.onmessage = ({ data }: MessageEvent<RegexReply>) => {
        if (data.type === "ready") {
          resolve();
          return;
        }
        const pending = this.pending;
        this.pending = undefined;
        clearTimeout(this.timer);
        if (data.type === "error") pending?.reject(new ProjectRegexWorkerError(data.message));
        else pending?.resolve(data.hits);
      };
    });
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.dispose(new ProjectRegexWorkerError(event.message || "Regex Worker failed"));
    };
    this.worker.onmessageerror = () => this.dispose(new ProjectRegexWorkerError("Invalid Regex Worker response"));
    signal.addEventListener("abort", this.cancel, { once: true });
    if (signal.aborted) this.cancel();
  }

  async initialize(query: string, caseSensitive: boolean): Promise<void> {
    await this.ready;
    await this.request({ type: "compile", query, caseSensitive }, SEARCH_LIMITS.durationMs);
  }

  push(text: string, first: boolean, end: boolean, limit: number, remainingMs: number): Promise<RegexHit[]> {
    return this.request({ type: "chunk", text, first, end, limit }, remainingMs);
  }

  private request(message: RegexRequest, remainingMs: number): Promise<RegexHit[]> {
    this.signal.throwIfAborted();
    if (this.closed || this.pending) return Promise.reject(new ProjectRegexWorkerError("Regex Worker unavailable"));
    if (remainingMs <= 0) {
      this.timeout();
      this.signal.throwIfAborted();
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.timer = setTimeout(this.timeout, remainingMs);
      try {
        this.worker.postMessage(message);
      } catch (error) {
        this.dispose(new ProjectRegexWorkerError(String(error)));
      }
    });
  }

  private readonly cancel = () => this.dispose(this.signal.reason);

  dispose(error: unknown = new ProjectRegexWorkerError("Regex Worker disposed")): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.signal.removeEventListener("abort", this.cancel);
    this.worker.terminate();
    this.rejectReady(error);
    this.pending?.reject(error);
    this.pending = undefined;
  }
}
