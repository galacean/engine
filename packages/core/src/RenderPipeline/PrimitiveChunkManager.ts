import { Engine } from "../Engine";
import { PrimitiveChunk } from "./PrimitiveChunk";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

/**
 * @internal
 */
export class PrimitiveChunkManager {
  primitiveChunks = new Array<PrimitiveChunk>();

  constructor(
    public engine: Engine,
    public maxVertexCount = 4096
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
    primitiveChunks.length = 0;
    this.primitiveChunks = null;
    this.engine = null;
  }
}
