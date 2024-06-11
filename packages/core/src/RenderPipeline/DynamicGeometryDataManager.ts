import { Engine } from "../Engine";
import { DynamicGeometryData } from "./DynamicGeometryData";
import { Chunk } from "./Chunk";

/**
 * @internal
 */
export class DynamicGeometryDataManager {
  /** The maximum number of vertex. */
  static MAX_VERTEX_COUNT = 4096;

  /** @internal */
  engine: Engine;
  /** @internal */
  dynamicGeometryDatas: DynamicGeometryData[] = [];
  /** @internal */
  maxVertexCount: number;

  constructor(engine: Engine, maxVertexCount: number = DynamicGeometryDataManager.MAX_VERTEX_COUNT) {
    this.engine = engine;
    this.maxVertexCount = maxVertexCount;
  }

  destroy(): void {
    const datas = this.dynamicGeometryDatas;
    for (let i = 0, l = datas.length; i < l; ++i) {
      datas[i].destroy();
    }
    datas.length = 0;
    this.dynamicGeometryDatas = null;
    this.engine = null;
  }

  clear() {
    const datas = this.dynamicGeometryDatas;
    for (let i = 0, l = datas.length; i < l; ++i) {
      datas[i].clear();
    }
  }

  allocateChunk(vertexCount: number): Chunk | null {
    const datas = this.dynamicGeometryDatas;
    const len = datas.length;
    let chunk: Chunk = null;
    for (let i = 0; i < len; ++i) {
      chunk = datas[i].allocateChunk(vertexCount);
      if (chunk) {
        chunk.id = i;
        return chunk;
      }
    }

    const data = (this.dynamicGeometryDatas[len] ||= new DynamicGeometryData(this.engine, this.maxVertexCount));
    chunk = data.allocateChunk(vertexCount);
    chunk.id = len;
    return chunk;
  }

  freeChunk(chunk: Chunk): void {
    const data = this.dynamicGeometryDatas[chunk.id];
    data && data.freeChunk(chunk);
  }

  uploadBuffer(): void {
    const datas = this.dynamicGeometryDatas;
    for (let i = 0, l = datas.length; i < l; ++i) {
      datas[i].uploadBuffer();
    }
  }
}
