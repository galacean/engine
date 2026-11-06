import type { AssetResourceSet, DescriptionsInput, DescriptionsResult, SearchInput, SearchResult } from "./contracts";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

export type RetrievalCallOptions = { signal?: AbortSignal };
type RequestInput = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

/** One Worker per owning application. Dispose on teardown; cancellation terminates all outstanding calls. */
export class RetrievalClient {
  private worker?: Worker;
  private opening?: Promise<unknown>;
  private nextId = 0;
  private disposed = false;
  private readonly pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }
  >();
  constructor(
    private readonly manifestUrl: string,
    private readonly timeoutMs = 30_000
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
  }

  searchAssets(input: SearchInput, options?: RetrievalCallOptions): Promise<SearchResult> {
    return this.call({ operation: "search", input }, options) as Promise<SearchResult>;
  }
  readAssetDescriptions(input: DescriptionsInput, options?: RetrievalCallOptions): Promise<DescriptionsResult> {
    return this.call({ operation: "descriptions", input }, options) as Promise<DescriptionsResult>;
  }
  readText(path: string, options?: RetrievalCallOptions & { maxBytes?: number }): Promise<string> {
    return this.call({ operation: "text", input: { path, maxBytes: options?.maxBytes } }, options) as Promise<string>;
  }
  resolveResource(path: string, options?: RetrievalCallOptions): Promise<{ path: string; url: string }> {
    return this.call({ operation: "resolve", input: { path } }, options) as Promise<{ path: string; url: string }>;
  }
  resourceSet(path: string, options?: RetrievalCallOptions): Promise<AssetResourceSet> {
    return this.call({ operation: "resources", input: { path } }, options) as Promise<AssetResourceSet>;
  }
  dispose() {
    this.disposed = true;
    this.reset(new Error("Retrieval client disposed"));
  }

  private async call(request: RequestInput, options: RetrievalCallOptions = {}): Promise<unknown> {
    options.signal?.throwIfAborted();
    if (this.disposed) throw new Error("Retrieval client disposed");
    const abort = () => this.reset(new DOMException("Retrieval cancelled; Worker stopped", "AbortError"));
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      if (!this.worker) {
        const worker = new Worker(new URL("./Retrieval.worker.ts", import.meta.url), { type: "module" });
        this.worker = worker;
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          const pending = this.pending.get(data.id);
          if (!pending) return;
          this.pending.delete(data.id);
          pending.cleanup();
          if (data.ok) pending.resolve(data.value);
          else pending.reject(new Error(data.error));
        };
        worker.onerror = (event) => {
          event.preventDefault();
          this.reset(new Error(event.message || "Retrieval Worker failed"));
        };
        worker.onmessageerror = () => this.reset(new Error("Invalid retrieval Worker response"));
        this.opening = this.send({
          operation: "open",
          input: { manifestUrl: new URL(this.manifestUrl, location.href).href }
        });
      }
      const owner = this.worker;
      try {
        await this.opening;
      } catch (error) {
        if (this.worker === owner) this.reset(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
      options.signal?.throwIfAborted();
      if (this.worker !== owner) throw new Error("Retrieval Worker was replaced");
      return await this.send(request);
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }
  private send(request: RequestInput): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Retrieval Worker is not available"));
        return;
      }
      const id = ++this.nextId;
      const timer = setTimeout(() => this.reset(new Error("Retrieval timed out; Worker stopped")), this.timeoutMs);
      this.pending.set(id, { resolve, reject, cleanup: () => clearTimeout(timer) });
      try {
        this.worker.postMessage({ ...request, id });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  private reset(error: Error) {
    this.worker?.terminate();
    this.worker = undefined;
    this.opening = undefined;
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }
}
