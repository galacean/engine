import { copyWaterTerrainSnapshot } from "../../authoring/terrain/WaterTerrainSnapshot";
/** Main-thread client that revives transferred compiler buffers without GPU work. */
import type { HeightfieldWaterDiagnostic } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { WaterQueryQualityV2 } from "../../authoring/quality/WaterQualityPlan";
import {
  HeightfieldWaterCompileWorkerMessageKind,
  type HeightfieldWaterCompiledTransfer,
  type HeightfieldWaterCompileWorkerIdentity,
  type HeightfieldWaterCompileWorkerRequest,
  type HeightfieldWaterCompileWorkerResponse,
  type HeightfieldWaterCompileWorkerSerializedError
} from "../../compiler/heightfield/HeightfieldWaterCompileWorkerProtocol";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import {
  HeightfieldReadonlyFloat32Buffer,
  HeightfieldReadonlyInt32Buffer,
  HeightfieldReadonlyUint16Buffer,
  HeightfieldReadonlyUint32Buffer,
  HeightfieldReadonlyUint8Buffer
} from "../../compiler/heightfield/HeightfieldNumericBuffer";
import { RiverReadonlyFloat32Buffer } from "../../compiler/shared/ReadonlyNumericBuffer";
import { WaterBufferOwnership } from "../../compiler/shared/WaterBufferOwnership";
import { preflightHeightfieldWaterDescriptorAllocation } from "../../compiler/heightfield/HeightfieldWaterValidator";
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";

interface PendingCompile {
  readonly resolve: (resource: HeightfieldWaterResource) => void;
  readonly reject: (error: Error) => void;
  readonly worker: Worker;
  readonly onMessage: (event: MessageEvent<HeightfieldWaterCompileWorkerResponse>) => void;
  readonly onError: (event: ErrorEvent) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
  readonly identity: Readonly<HeightfieldWaterCompileWorkerIdentity>;
}

export class HeightfieldWaterCompileWorkerError extends Error {
  constructor(
    readonly diagnostics: readonly HeightfieldWaterDiagnostic[],
    readonly requestId: number,
    readonly identity: Readonly<HeightfieldWaterCompileWorkerIdentity>,
    readonly phase: "compile" | "transfer" | "worker-runtime",
    readonly workerError?: Readonly<HeightfieldWaterCompileWorkerSerializedError>
  ) {
    const source = identity.sourceId ?? "unknown-source";
    const hash = identity.sourceHash ? ` hash=${identity.sourceHash}` : "";
    const generation = identity.generationId === undefined ? "" : ` generation=${identity.generationId}`;
    const diagnosticDetail = diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(" | ");
    const detail = workerError
      ? `${workerError.name}: ${workerError.message}`
      : diagnosticDetail || "Worker failed without diagnostics.";
    super(
      `Heightfield water compile failed phase=${phase} request=${requestId}${generation} source=${source}${hash}: ${detail}`
    );
    this.name = "HeightfieldWaterCompileWorkerError";
    if (workerError?.stack) this.stack = `${this.name}: ${this.message}\n[worker stack]\n${workerError.stack}`;
  }
}

export interface HeightfieldWaterCompileWorkerTelemetry {
  readonly sourceId?: string;
  readonly sourceHash?: string;
  readonly generationId?: number;
}

export function reviveHeightfieldWaterCompiledData(
  transferred: HeightfieldWaterCompiledTransfer
): HeightfieldWaterCompiledData {
  return {
    ...transferred,
    lakeBoundary: transferred.lakeBoundary
      ? Object.freeze({
          ...transferred.lakeBoundary,
          rings: Object.freeze(
            transferred.lakeBoundary.rings.map((r) =>
              Object.freeze(r.map((p) => Object.freeze([...p] as [number, number])))
            )
          )
        })
      : undefined,
    components: transferred.components.map((component) => ({
      ...component,
      wetTexelIndices: new HeightfieldReadonlyUint32Buffer(component.wetTexelIndices, WaterBufferOwnership.Transfer)
    })),
    chunks: transferred.chunks.map((chunk) => ({
      ...chunk,
      geometry: {
        ...chunk.geometry,
        positions: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.positions, WaterBufferOwnership.Transfer),
        normals: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.normals, WaterBufferOwnership.Transfer),
        tangents: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.tangents, WaterBufferOwnership.Transfer),
        uvs: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.uvs, WaterBufferOwnership.Transfer),
        indices: new HeightfieldReadonlyUint16Buffer(chunk.geometry.indices, WaterBufferOwnership.Transfer)
      }
    })),
    localMapAtlas: {
      ...transferred.localMapAtlas,
      pixels: new HeightfieldReadonlyUint8Buffer(transferred.localMapAtlas.pixels, WaterBufferOwnership.Transfer)
    },
    queryGrid: transferred.queryGrid
      ? {
          ...transferred.queryGrid,
          ...(transferred.queryGrid.bedTerrain
            ? { bedTerrain: copyWaterTerrainSnapshot(transferred.queryGrid.bedTerrain) }
            : {}),
          wetMask: new HeightfieldReadonlyUint8Buffer(transferred.queryGrid.wetMask, WaterBufferOwnership.Transfer),
          shoreDistances: transferred.queryGrid.shoreDistances
            ? new HeightfieldReadonlyFloat32Buffer(transferred.queryGrid.shoreDistances, WaterBufferOwnership.Transfer)
            : undefined,
          componentIndices: new HeightfieldReadonlyInt32Buffer(
            transferred.queryGrid.componentIndices,
            WaterBufferOwnership.Transfer
          ),
          surfaceHeights: new HeightfieldReadonlyFloat32Buffer(
            transferred.queryGrid.surfaceHeights,
            WaterBufferOwnership.Transfer
          ),
          bedHeights: new HeightfieldReadonlyFloat32Buffer(
            transferred.queryGrid.bedHeights,
            WaterBufferOwnership.Transfer
          ),
          flowVectorsXZ: new HeightfieldReadonlyFloat32Buffer(
            transferred.queryGrid.flowVectorsXZ,
            WaterBufferOwnership.Transfer
          )
        }
      : undefined,
    waveSet: {
      ...transferred.waveSet,
      packedShaderData: new RiverReadonlyFloat32Buffer(
        transferred.waveSet.packedShaderData,
        WaterBufferOwnership.Transfer
      )
    }
  };
}

export class HeightfieldWaterCompileWorkerClient {
  private readonly _createWorker: () => Worker;
  private readonly _pending = new Map<number, PendingCompile>();
  private readonly _idleWorkers: Worker[] = [];
  private _nextRequestId = 1;
  private _disposed = false;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL("../../compiler/heightfield/HeightfieldWaterCompileWorker.ts", import.meta.url), {
        type: "module"
      })
  ) {
    this._createWorker = createWorker;
  }

  compile(
    source: unknown,
    signal?: AbortSignal,
    queryQuality: WaterQueryQualityV2 = "dense",
    telemetry: Readonly<HeightfieldWaterCompileWorkerTelemetry> = Object.freeze({})
  ): Promise<HeightfieldWaterResource> {
    if (this._disposed) {
      return Promise.reject(new Error("Heightfield water compile worker client has been disposed."));
    }
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Heightfield water Worker compilation was aborted.", "AbortError"));
    }
    const requestId = this._nextRequestId++;
    const sourceId =
      telemetry.sourceId ??
      (typeof source === "object" && source !== null && "id" in source && typeof source.id === "string"
        ? source.id
        : undefined);
    const identity = Object.freeze({
      sourceId,
      sourceHash: telemetry.sourceHash,
      generationId: telemetry.generationId
    });
    const preflightDiagnostics = preflightHeightfieldWaterDescriptorAllocation(source);
    if (preflightDiagnostics.length > 0) {
      return Promise.reject(
        new HeightfieldWaterCompileWorkerError(preflightDiagnostics, requestId, identity, "compile")
      );
    }
    const request: HeightfieldWaterCompileWorkerRequest = {
      kind: HeightfieldWaterCompileWorkerMessageKind.Compile,
      requestId,
      identity,
      source,
      queryQuality
    };
    return new Promise<HeightfieldWaterResource>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this._idleWorkers.pop() ?? this._createWorker();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to create heightfield water compile Worker."));
        return;
      }
      const onMessage = (event: MessageEvent<HeightfieldWaterCompileWorkerResponse>): void => {
        this._handleMessage(requestId, event);
      };
      const onError = (event: ErrorEvent): void => {
        this._handleError(requestId, event);
      };
      const onAbort = signal
        ? () => {
            const pending = this._takePending(requestId);
            if (!pending) return;
            pending.reject(new DOMException("Heightfield water Worker compilation was aborted.", "AbortError"));
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
        identity
      });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      if (signal && onAbort) signal.addEventListener("abort", onAbort, { once: true });
      try {
        worker.postMessage(request);
      } catch (error) {
        const pending = this._takePending(requestId);
        pending?.reject(
          error instanceof Error ? error : new Error("Failed to post heightfield water compile request.")
        );
      }
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const error = new Error("Heightfield water compile worker client was disposed before compilation completed.");
    for (const requestId of [...this._pending.keys()]) this._takePending(requestId)?.reject(error);
    this._pending.clear();
    for (const worker of this._idleWorkers.splice(0)) worker.terminate();
  }

  private _handleMessage(requestId: number, event: MessageEvent<HeightfieldWaterCompileWorkerResponse>): void {
    const response = event.data;
    if (response.requestId !== requestId) return;
    const pending = this._takePending(requestId, "detach");
    if (!pending) return;
    if (response.kind === HeightfieldWaterCompileWorkerMessageKind.Failure) {
      pending.worker.terminate();
      pending.reject(
        new HeightfieldWaterCompileWorkerError(
          response.diagnostics,
          response.requestId,
          response.identity,
          response.phase,
          response.error
        )
      );
      return;
    }
    try {
      const resource = HeightfieldWaterResource.create(reviveHeightfieldWaterCompiledData(response.data));
      this._idleWorkers.push(pending.worker);
      pending.resolve(resource);
    } catch (error) {
      pending.worker.terminate();
      pending.reject(error instanceof Error ? error : new Error("Failed to revive heightfield water worker output."));
    }
  }

  private _handleError(requestId: number, event: ErrorEvent): void {
    const pending = this._takePending(requestId);
    if (!pending) return;
    const location = event.filename
      ? `${event.filename}${event.lineno ? `:${event.lineno}:${event.colno ?? 0}` : ""}`
      : undefined;
    pending.reject(
      new HeightfieldWaterCompileWorkerError(
        Object.freeze([]),
        requestId,
        pending.identity,
        "worker-runtime",
        Object.freeze({
          name: event.error instanceof Error ? event.error.name : "WorkerRuntimeError",
          message: [event.message || "Worker runtime error", location].filter(Boolean).join(" at "),
          stack: event.error instanceof Error ? event.error.stack : undefined
        })
      )
    );
  }

  private _takePending(
    requestId: number,
    disposition: "terminate" | "detach" = "terminate"
  ): PendingCompile | undefined {
    const pending = this._pending.get(requestId);
    if (!pending) return undefined;
    this._pending.delete(requestId);
    pending.worker.removeEventListener("message", pending.onMessage);
    pending.worker.removeEventListener("error", pending.onError);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    if (disposition === "terminate") pending.worker.terminate();
    return pending;
  }
}
