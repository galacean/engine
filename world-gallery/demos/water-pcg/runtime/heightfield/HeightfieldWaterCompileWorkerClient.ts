/** Main-thread client that revives transferred compiler buffers without GPU work. */
import type { HeightfieldWaterDiagnostic } from "../../authoring/heightfield/HeightfieldWaterTypes";
import {
  HeightfieldWaterCompileWorkerMessageKind,
  type HeightfieldWaterCompiledTransfer,
  type HeightfieldWaterCompileWorkerRequest,
  type HeightfieldWaterCompileWorkerResponse
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
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";

interface PendingCompile {
  readonly resolve: (resource: HeightfieldWaterResource) => void;
  readonly reject: (error: Error) => void;
}

export class HeightfieldWaterCompileWorkerError extends Error {
  constructor(readonly diagnostics: readonly HeightfieldWaterDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(" | "));
    this.name = "HeightfieldWaterCompileWorkerError";
  }
}

export function reviveHeightfieldWaterCompiledData(
  transferred: HeightfieldWaterCompiledTransfer
): HeightfieldWaterCompiledData {
  return {
    ...transferred,
    components: transferred.components.map((component) => ({
      ...component,
      wetTexelIndices: new HeightfieldReadonlyUint32Buffer(component.wetTexelIndices)
    })),
    chunks: transferred.chunks.map((chunk) => ({
      ...chunk,
      geometry: {
        ...chunk.geometry,
        positions: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.positions),
        normals: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.normals),
        tangents: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.tangents),
        uvs: new HeightfieldReadonlyFloat32Buffer(chunk.geometry.uvs),
        indices: new HeightfieldReadonlyUint16Buffer(chunk.geometry.indices)
      }
    })),
    localMapAtlas: {
      ...transferred.localMapAtlas,
      pixels: new HeightfieldReadonlyUint8Buffer(transferred.localMapAtlas.pixels)
    },
    queryGrid: {
      ...transferred.queryGrid,
      wetMask: new HeightfieldReadonlyUint8Buffer(transferred.queryGrid.wetMask),
      componentIndices: new HeightfieldReadonlyInt32Buffer(transferred.queryGrid.componentIndices),
      surfaceHeights: new HeightfieldReadonlyFloat32Buffer(transferred.queryGrid.surfaceHeights),
      bedHeights: new HeightfieldReadonlyFloat32Buffer(transferred.queryGrid.bedHeights),
      flowVectorsXZ: new HeightfieldReadonlyFloat32Buffer(transferred.queryGrid.flowVectorsXZ)
    },
    waveSet: {
      ...transferred.waveSet,
      packedShaderData: new RiverReadonlyFloat32Buffer(transferred.waveSet.packedShaderData)
    }
  };
}

export class HeightfieldWaterCompileWorkerClient {
  private readonly _worker: Worker;
  private readonly _pending = new Map<number, PendingCompile>();
  private _nextRequestId = 1;
  private _disposed = false;

  constructor(worker?: Worker) {
    this._worker =
      worker ??
      new Worker(new URL("../../compiler/heightfield/HeightfieldWaterCompileWorker.ts", import.meta.url), {
        type: "module"
      });
    this._worker.addEventListener("message", this._handleMessage);
    this._worker.addEventListener("error", this._handleError);
  }

  compile(source: unknown): Promise<HeightfieldWaterResource> {
    if (this._disposed) {
      return Promise.reject(new Error("Heightfield water compile worker client has been disposed."));
    }
    const requestId = this._nextRequestId++;
    const request: HeightfieldWaterCompileWorkerRequest = {
      kind: HeightfieldWaterCompileWorkerMessageKind.Compile,
      requestId,
      source
    };
    return new Promise<HeightfieldWaterResource>((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      try {
        this._worker.postMessage(request);
      } catch (error) {
        this._pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Failed to post heightfield water compile request."));
      }
    });
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._worker.removeEventListener("message", this._handleMessage);
    this._worker.removeEventListener("error", this._handleError);
    this._worker.terminate();
    const error = new Error("Heightfield water compile worker client was disposed before compilation completed.");
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
  }

  private readonly _handleMessage = (event: MessageEvent<HeightfieldWaterCompileWorkerResponse>): void => {
    const response = event.data;
    const pending = this._pending.get(response.requestId);
    if (!pending) return;
    this._pending.delete(response.requestId);
    if (response.kind === HeightfieldWaterCompileWorkerMessageKind.Failure) {
      pending.reject(new HeightfieldWaterCompileWorkerError(response.diagnostics));
      return;
    }
    try {
      pending.resolve(HeightfieldWaterResource.create(reviveHeightfieldWaterCompiledData(response.data)));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error("Failed to revive heightfield water worker output."));
    }
  };

  private readonly _handleError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Heightfield water compile worker failed.");
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
  };
}
