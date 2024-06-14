import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { Area, PrimitiveChunk } from "./PrimitiveChunk";

/**
 * @internal
 */
export class SubPrimitiveChunk implements IPoolElement {
  id = -1;
  chunk: PrimitiveChunk;
  vertexArea: Area;
  subMesh: SubMesh;
  indices: number[];

  updateBuffer(): void {
    const { chunk } = this;
    const { start, size } = this.vertexArea;
    chunk.updateVertexStart = Math.min(chunk.updateVertexStart, start);
    chunk.updateVertexLength = Math.max(chunk.updateVertexLength, start + size);
  }

  dispose?(): void {
    this.id = -1;
    this.chunk = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
