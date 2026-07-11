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
}

export class RiverCompileWorkerError extends Error {
  constructor(readonly diagnostics: readonly RiverDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(" | "));
    this.name = "RiverCompileWorkerError";
  }
}

export class RiverCompileWorkerClient {
  private readonly _worker: Worker;
  private readonly _pending = new Map<number, PendingCompile>();
  private _nextRequestId = 1;
  private _disposed = false;
  private _lastDeserializeMs = 0;

  constructor(worker?: Worker) {
    this._worker =
      worker ?? new Worker(new URL("../../compiler/river/RiverCompileWorker.ts", import.meta.url), { type: "module" });
    this._worker.addEventListener("message", this._handleMessage);
    this._worker.addEventListener("error", this._handleError);
  }

  compile(source: unknown): Promise<RiverResource> {
    if (this._disposed) return Promise.reject(new Error("River compile worker client has been disposed."));
    const requestId = this._nextRequestId++;
    const request: RiverCompileWorkerRequest = {
      kind: RiverCompileWorkerMessageKind.Compile,
      requestId,
      source
    };
    return new Promise<RiverResource>((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      try {
        this._worker.postMessage(request);
      } catch (error) {
        this._pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Failed to post river compile request."));
      }
    });
  }

  get lastDeserializeMs(): number {
    return this._lastDeserializeMs;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._worker.removeEventListener("message", this._handleMessage);
    this._worker.removeEventListener("error", this._handleError);
    this._worker.terminate();
    const error = new Error("River compile worker client was disposed before compilation completed.");
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
  }

  private readonly _handleMessage = (event: MessageEvent<RiverCompileWorkerResponse>): void => {
    const response = event.data;
    const pending = this._pending.get(response.requestId);
    if (!pending) return;
    this._pending.delete(response.requestId);
    if (response.kind === RiverCompileWorkerMessageKind.Failure) {
      pending.reject(new RiverCompileWorkerError(response.diagnostics));
      return;
    }
    try {
      const start = performance.now();
      const resource = RiverResource.deserialize(new Uint8Array(response.resourceBytes));
      this._lastDeserializeMs = performance.now() - start;
      pending.resolve(resource);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Failed to deserialize river worker output."));
    }
  };

  private readonly _handleError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "River compile worker failed.");
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
  };
}
