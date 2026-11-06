import type { RiverDiagnostic } from "../../compiler/shared/diagnostics";
import {
  RiverCompileWorkerMessageKind,
  type RiverCompileWorkerRequest,
  type RiverCompileWorkerResponse
} from "../../compiler/river/RiverCompileWorkerProtocol";
import { RiverResource } from "./RiverResource";

interface PendingCompile {
  readonly resolve: (resource: RiverResource) => void;
  readonly reject: (error: Error) => void;
  readonly worker: Worker;
  readonly onMessage: (event: MessageEvent<RiverCompileWorkerResponse>) => void;
  readonly onError: (event: ErrorEvent) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
  readonly physicalSourceHash?: string;
}

export class RiverCompileWorkerError extends Error {
  constructor(readonly diagnostics: readonly RiverDiagnostic[]) {
    super(
      diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => `${diagnostic.message} (${diagnostic.path})`)
        .join("\n")
    );
    this.name = "RiverCompileWorkerError";
  }
}

export class RiverCompileWorkerClient {
  private readonly _createWorker: () => Worker;
  private readonly _pending = new Map<number, PendingCompile>();
  private _nextRequestId = 1;
  private _disposed = false;
  private _lastDeserializeMs = 0;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL("../../compiler/river/RiverCompileWorker.ts", import.meta.url), { type: "module" })
  ) {
    this._createWorker = createWorker;
  }

  compile(source: unknown, signal?: AbortSignal, physicalSourceHash?: string): Promise<RiverResource> {
    if (this._disposed) return Promise.reject(new Error("River compile worker client has been disposed."));
    if (signal?.aborted) {
      return Promise.reject(new DOMException("River Worker compilation was aborted.", "AbortError"));
    }
    const requestId = this._nextRequestId++;
    const request: RiverCompileWorkerRequest = {
      kind: RiverCompileWorkerMessageKind.Compile,
      requestId,
      source
    };
    return new Promise<RiverResource>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this._createWorker();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to create River compile Worker."));
        return;
      }
      const onMessage = (event: MessageEvent<RiverCompileWorkerResponse>): void => {
        this._handleMessage(requestId, event);
      };
      const onError = (event: ErrorEvent): void => {
        this._handleError(requestId, event);
      };
      const onAbort = signal
        ? () => {
            const pending = this._takePending(requestId);
            if (!pending) return;
            pending.reject(new DOMException("River Worker compilation was aborted.", "AbortError"));
          }
        : undefined;
      this._pending.set(requestId, {
        resolve,
        reject,
        worker,
        onMessage,
        onError,
        signal,
        onAbort,
        physicalSourceHash
      });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      if (signal && onAbort) signal.addEventListener("abort", onAbort, { once: true });
      try {
        worker.postMessage(request);
      } catch (error) {
        const pending = this._takePending(requestId);
        pending?.reject(error instanceof Error ? error : new Error("Failed to post river compile request."));
      }
    });
  }

  get lastDeserializeMs(): number {
    return this._lastDeserializeMs;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const error = new Error("River compile worker client was disposed before compilation completed.");
    for (const requestId of [...this._pending.keys()]) this._takePending(requestId)?.reject(error);
    this._pending.clear();
  }

  private _handleMessage(requestId: number, event: MessageEvent<RiverCompileWorkerResponse>): void {
    const response = event.data;
    if (response.requestId !== requestId) return;
    const pending = this._takePending(requestId);
    if (!pending) return;
    if (response.kind === RiverCompileWorkerMessageKind.Failure) {
      pending.reject(new RiverCompileWorkerError(response.diagnostics));
      return;
    }
    try {
      const start = performance.now();
      const resource = RiverResource.fromWorkerTransfer(response.resource, pending.physicalSourceHash);
      this._lastDeserializeMs = performance.now() - start;
      pending.resolve(resource);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Failed to deserialize river worker output."));
    }
  }

  private _handleError(requestId: number, event: ErrorEvent): void {
    const error = new Error(event.message || "River compile worker failed.");
    this._takePending(requestId)?.reject(error);
  }

  private _takePending(requestId: number): PendingCompile | undefined {
    const pending = this._pending.get(requestId);
    if (!pending) return undefined;
    this._pending.delete(requestId);
    pending.worker.removeEventListener("message", pending.onMessage);
    pending.worker.removeEventListener("error", pending.onError);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.worker.terminate();
    return pending;
  }
}
