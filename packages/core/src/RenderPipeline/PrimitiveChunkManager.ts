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
    let subChunk: SubPrimitiveChunk = null;
    for (let i = 0; i < length; ++i) {
      subChunk = dataArray[i].allocateSubChunk(vertexCount);
      if (subChunk) {
        subChunk.id = i;
        return subChunk;
      }
    }

    const data = (this.primitiveChunkArray[length] ||= new PrimitiveChunk(this.engine, this.maxVertexCount));
    subChunk = data.allocateSubChunk(vertexCount);
    subChunk.id = length;
    return subChunk;
  }

  freeSubChunk(subChunk: SubPrimitiveChunk): void {
    this.primitiveChunkArray[subChunk.id].freeSubChunk(subChunk);
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
