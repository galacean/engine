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
      wetTexelIndices: component.wetTexelIndices.toTypedArray()
    })),
    chunks: data.chunks.map((chunk) => ({
      ...chunk,
      geometry: {
        ...chunk.geometry,
        positions: chunk.geometry.positions.toTypedArray(),
        normals: chunk.geometry.normals.toTypedArray(),
        tangents: chunk.geometry.tangents.toTypedArray(),
        uvs: chunk.geometry.uvs.toTypedArray(),
        indices: chunk.geometry.indices.toTypedArray()
      }
    })),
    localMapAtlas: {
      ...data.localMapAtlas,
      pixels: data.localMapAtlas.pixels.toTypedArray()
    },
    queryGrid: {
      ...data.queryGrid,
      wetMask: data.queryGrid.wetMask.toTypedArray(),
      componentIndices: data.queryGrid.componentIndices.toTypedArray(),
      surfaceHeights: data.queryGrid.surfaceHeights.toTypedArray(),
      bedHeights: data.queryGrid.bedHeights.toTypedArray(),
      flowVectorsXZ: data.queryGrid.flowVectorsXZ.toTypedArray()
    },
    waveSet: {
      ...data.waveSet,
      packedShaderData: data.waveSet.packedShaderData.toTypedArray()
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
  transferables.push(
    data.localMapAtlas.pixels.buffer,
    data.queryGrid.wetMask.buffer,
    data.queryGrid.componentIndices.buffer,
    data.queryGrid.surfaceHeights.buffer,
    data.queryGrid.bedHeights.buffer,
    data.queryGrid.flowVectorsXZ.buffer,
    data.waveSet.packedShaderData.buffer
  );
  return transferables;
}

const workerScope = typeof self === "undefined" ? undefined : (self as unknown as HeightfieldWorkerScope);

if (workerScope) workerScope.onmessage = (event): void => {
  const request = event.data;
  if (request.kind !== HeightfieldWaterCompileWorkerMessageKind.Compile) return;
  const result = HeightfieldWaterCompiler.compile(request.source);
  if (!result.data) {
    workerScope.postMessage({
      kind: HeightfieldWaterCompileWorkerMessageKind.Failure,
      requestId: request.requestId,
      diagnostics: result.diagnostics
    });
    return;
  }
  const data = createHeightfieldWaterCompiledTransfer(result.data);
  workerScope.postMessage(
    { kind: HeightfieldWaterCompileWorkerMessageKind.Success, requestId: request.requestId, data },
    collectHeightfieldWaterTransferables(data)
  );
};
