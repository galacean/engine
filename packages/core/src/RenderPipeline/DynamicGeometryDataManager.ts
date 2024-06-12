import { Engine } from "../Engine";
import { DynamicGeometryData } from "./DynamicGeometryData";
import { Chunk } from "./Chunk";

/**
 * @internal
 */
export class DynamicGeometryDataManager {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT = 4096;

  dynamicGeometryDataArray = new Array<DynamicGeometryData>();

  constructor(
    public engine: Engine,
    public maxVertexCount = DynamicGeometryDataManager.MAX_VERTEX_COUNT
  ) {}

  allocateChunk(vertexCount: number): Chunk {
    const dataArray = this.dynamicGeometryDataArray;
    const length = dataArray.length;
    let chunk: Chunk = null;
    for (let i = 0; i < length; ++i) {
      chunk = dataArray[i].allocateChunk(vertexCount);
      if (chunk) {
        chunk.id = i;
        return chunk;
      }
    }

    const data = (this.dynamicGeometryDataArray[length] ||= new DynamicGeometryData(this.engine, this.maxVertexCount));
    chunk = data.allocateChunk(vertexCount);
    chunk.id = length;
    return chunk;
  }

  freeChunk(chunk: Chunk): void {
    this.dynamicGeometryDataArray[chunk.id].freeChunk(chunk);
  }

  uploadBuffer(): void {
    const dataArray = this.dynamicGeometryDataArray;
    for (let i = 0, n = dataArray.length; i < n; ++i) {
      dataArray[i].uploadBuffer();
    }
  }

  clear(): void {
    const dataArray = this.dynamicGeometryDataArray;
    for (let i = 0, n = dataArray.length; i < n; ++i) {
      dataArray[i].clear();
    }
  }

  destroy(): void {
    const dataArray = this.dynamicGeometryDataArray;
    for (let i = 0, n = dataArray.length; i < n; ++i) {
      dataArray[i].destroy();
    }
    dataArray.length = 0;
    this.dynamicGeometryDataArray = null;
    this.engine = null;
  }
}
