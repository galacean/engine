import { Engine } from "../Engine";
import { PrimitiveChunk } from "./PrimitiveChunk";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

/**
 * @internal
 */
export class PrimitiveChunkManager {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT = 4096;

  primitiveChunkArray = new Array<PrimitiveChunk>();

  constructor(
    public engine: Engine,
    public maxVertexCount = PrimitiveChunkManager.MAX_VERTEX_COUNT
  ) {}

  allocateSubChunk(vertexCount: number): SubPrimitiveChunk {
    const dataArray = this.primitiveChunkArray;
    const length = dataArray.length;
    let chunk: SubPrimitiveChunk = null;
    for (let i = 0; i < length; ++i) {
      chunk = dataArray[i].allocateSubChunk(vertexCount);
      if (chunk) {
        chunk.id = i;
        return chunk;
      }
    }

    const data = (this.primitiveChunkArray[length] ||= new PrimitiveChunk(this.engine, this.maxVertexCount));
    chunk = data.allocateSubChunk(vertexCount);
    chunk.id = length;
    return chunk;
  }

  freeSubChunk(chunk: SubPrimitiveChunk): void {
    this.primitiveChunkArray[chunk.id].freeSubChunk(chunk);
  }

  uploadBuffer(): void {
    const dataArray = this.primitiveChunkArray;
    for (let i = 0, n = dataArray.length; i < n; ++i) {
      dataArray[i].uploadBuffer();
    }
  }

  destroy(): void {
    const dataArray = this.primitiveChunkArray;
    for (let i = 0, n = dataArray.length; i < n; ++i) {
      dataArray[i].destroy();
    }
    dataArray.length = 0;
    this.primitiveChunkArray = null;
    this.engine = null;
  }
}
