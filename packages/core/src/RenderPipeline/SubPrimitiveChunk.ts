import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { Area, PrimitiveChunk } from "./PrimitiveChunk";

/**
 * @internal
 */
export class SubPrimitiveChunk implements IPoolElement {
  id = -1;
  primitiveChunk: PrimitiveChunk;
  vertexArea: Area;
  subMesh: SubMesh;
  indices: number[];

  updateBuffer(): void {
    const { primitiveChunk } = this;
    const { start, size } = this.vertexArea;
    primitiveChunk.updateVertexStart = Math.min(primitiveChunk.updateVertexStart, start);
    primitiveChunk.updateVertexLength = Math.max(primitiveChunk.updateVertexLength, start + size);
  }

  dispose?(): void {
    this.id = -1;
    this.primitiveChunk = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
