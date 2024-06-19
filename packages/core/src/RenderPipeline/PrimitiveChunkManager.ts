import { Engine } from "../Engine";
import { SubMesh } from "../graphic";
import { ReturnableObjectPool } from "../utils/ReturnableObjectPool";
import { Area, PrimitiveChunk } from "./PrimitiveChunk";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

/**
 * @internal
 */
export class PrimitiveChunkManager {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT = 4096;

  primitiveChunks = new Array<PrimitiveChunk>();
  areaPool = new ReturnableObjectPool(Area, 10);
  subChunkPool = new ReturnableObjectPool(SubPrimitiveChunk, 10);
  subMeshPool = new ReturnableObjectPool(SubMesh, 10);

  constructor(
    public engine: Engine,
    public maxVertexCount = PrimitiveChunkManager.MAX_VERTEX_COUNT
  ) {}

  allocateSubChunk(vertexCount: number): SubPrimitiveChunk {
    const primitiveChunks = this.primitiveChunks;
    const length = primitiveChunks.length;
    let subChunk: SubPrimitiveChunk = null;
    for (let i = 0; i < length; ++i) {
      subChunk = primitiveChunks[i].allocateSubChunk(vertexCount);
      if (subChunk) {
        return subChunk;
      }
    }

    const data = (primitiveChunks[length] ||= new PrimitiveChunk(this.engine, this.maxVertexCount));
    subChunk = data.allocateSubChunk(vertexCount);
    return subChunk;
  }

  freeSubChunk(subChunk: SubPrimitiveChunk): void {
    subChunk.chunk.freeSubChunk(subChunk);
  }

  uploadBuffer(): void {
    const { primitiveChunks } = this;
    for (let i = 0, n = primitiveChunks.length; i < n; ++i) {
      primitiveChunks[i].uploadBuffer();
    }
  }

  destroy(): void {
    const { primitiveChunks } = this;
    for (let i = 0, n = primitiveChunks.length; i < n; ++i) {
      primitiveChunks[i].destroy();
    }
    this.areaPool = null;
    this.subChunkPool = null;
    this.subMeshPool = null;
    primitiveChunks.length = 0;
    this.primitiveChunks = null;
    this.engine = null;
  }
}
