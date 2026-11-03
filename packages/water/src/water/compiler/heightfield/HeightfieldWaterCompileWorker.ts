/** Browser Worker entrypoint for CPU-only heightfield-water compilation. */
import { HeightfieldWaterCompiler } from "./HeightfieldWaterCompiler";
import {
  HeightfieldWaterCompileWorkerMessageKind,
  type HeightfieldWaterCompiledTransfer,
  type HeightfieldWaterCompileWorkerFailure,
  type HeightfieldWaterCompileWorkerRequest,
  type HeightfieldWaterCompileWorkerSuccess
} from "./HeightfieldWaterCompileWorkerProtocol";
import type { HeightfieldWaterCompiledData } from "./HeightfieldWaterCompiledTypes";

interface HeightfieldWorkerScope {
  onmessage: ((event: MessageEvent<HeightfieldWaterCompileWorkerRequest>) => void) | null;
  postMessage(
    message: HeightfieldWaterCompileWorkerSuccess | HeightfieldWaterCompileWorkerFailure,
    transfer?: Transferable[]
  ): void;
}

export function createHeightfieldWaterCompiledTransfer(
  data: HeightfieldWaterCompiledData
): HeightfieldWaterCompiledTransfer {
  return {
    ...data,
    components: data.components.map((component) => ({
      ...component,
      wetTexelIndices: component.wetTexelIndices.borrowTypedArray()
    })),
    chunks: data.chunks.map((chunk) => ({
      ...chunk,
      geometry: {
        ...chunk.geometry,
        positions: chunk.geometry.positions.borrowTypedArray(),
        normals: chunk.geometry.normals.borrowTypedArray(),
        tangents: chunk.geometry.tangents.borrowTypedArray(),
        uvs: chunk.geometry.uvs.borrowTypedArray(),
        indices: chunk.geometry.indices.borrowTypedArray()
      }
    })),
    localMapAtlas: {
      ...data.localMapAtlas,
      pixels: data.localMapAtlas.pixels.borrowTypedArray()
    },
    queryGrid: data.queryGrid
      ? {
          ...data.queryGrid,
          wetMask: data.queryGrid.wetMask.borrowTypedArray(),
          shoreDistances: data.queryGrid.shoreDistances?.borrowTypedArray(),
          componentIndices: data.queryGrid.componentIndices.borrowTypedArray(),
          surfaceHeights: data.queryGrid.surfaceHeights.borrowTypedArray(),
          bedHeights: data.queryGrid.bedHeights.borrowTypedArray(),
          flowVectorsXZ: data.queryGrid.flowVectorsXZ.borrowTypedArray()
        }
      : undefined,
    waveSet: {
      ...data.waveSet,
      packedShaderData: data.waveSet.packedShaderData.borrowTypedArray()
    }
  };
}

export function collectHeightfieldWaterTransferables(data: HeightfieldWaterCompiledTransfer): Transferable[] {
  const transferables: Transferable[] = [];
  for (const component of data.components) transferables.push(component.wetTexelIndices.buffer);
  for (const chunk of data.chunks) {
    transferables.push(
      chunk.geometry.positions.buffer,
      chunk.geometry.normals.buffer,
      chunk.geometry.tangents.buffer,
      chunk.geometry.uvs.buffer,
      chunk.geometry.indices.buffer
    );
  }
  transferables.push(data.localMapAtlas.pixels.buffer);
  if (data.queryGrid) {
    if (data.queryGrid.shoreDistances) transferables.push(data.queryGrid.shoreDistances.buffer);
    transferables.push(
      data.queryGrid.wetMask.buffer,
      data.queryGrid.componentIndices.buffer,
      data.queryGrid.surfaceHeights.buffer,
      data.queryGrid.bedHeights.buffer,
      data.queryGrid.flowVectorsXZ.buffer
    );
  }
  transferables.push(data.waveSet.packedShaderData.buffer);
  return transferables;
}

const workerScope = typeof self === "undefined" ? undefined : (self as unknown as HeightfieldWorkerScope);

export function executeHeightfieldWaterCompileWorkerRequest(
  request: Readonly<HeightfieldWaterCompileWorkerRequest>
): Readonly<{
  response: HeightfieldWaterCompileWorkerSuccess | HeightfieldWaterCompileWorkerFailure;
  transferables: readonly Transferable[];
}> {
  try {
    const result = HeightfieldWaterCompiler.compile(request.source, { queryQuality: request.queryQuality });
    if (!result.data) {
      return Object.freeze({
        response: Object.freeze({
          kind: HeightfieldWaterCompileWorkerMessageKind.Failure,
          requestId: request.requestId,
          identity: request.identity,
          phase: "compile",
          diagnostics: result.diagnostics
        }),
        transferables: Object.freeze([])
      });
    }
    try {
      const data = createHeightfieldWaterCompiledTransfer(result.data);
      return Object.freeze({
        response: Object.freeze({
          kind: HeightfieldWaterCompileWorkerMessageKind.Success,
          requestId: request.requestId,
          identity: request.identity,
          data
        }),
        transferables: Object.freeze(collectHeightfieldWaterTransferables(data))
      });
    } catch (error) {
      return createUnexpectedFailure(request, "transfer", error);
    }
  } catch (error) {
    return createUnexpectedFailure(request, "compile", error);
  }
}

function createUnexpectedFailure(
  request: Readonly<HeightfieldWaterCompileWorkerRequest>,
  phase: "compile" | "transfer",
  error: unknown
): Readonly<{ response: HeightfieldWaterCompileWorkerFailure; transferables: readonly Transferable[] }> {
  const resolved = error instanceof Error ? error : new Error(String(error));
  return Object.freeze({
    response: Object.freeze({
      kind: HeightfieldWaterCompileWorkerMessageKind.Failure,
      requestId: request.requestId,
      identity: request.identity,
      phase,
      diagnostics: Object.freeze([]),
      error: Object.freeze({ name: resolved.name, message: resolved.message, stack: resolved.stack })
    }),
    transferables: Object.freeze([])
  });
}

if (workerScope)
  workerScope.onmessage = (event): void => {
    const request = event.data;
    if (request.kind !== HeightfieldWaterCompileWorkerMessageKind.Compile) return;
    const result = executeHeightfieldWaterCompileWorkerRequest(request);
    workerScope.postMessage(result.response, [...result.transferables]);
  };
