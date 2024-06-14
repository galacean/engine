import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { Area, DynamicGeometryData } from "./DynamicGeometryData";

/**
 * @internal
 */
export class Chunk implements IPoolElement {
  id = -1;
  data: DynamicGeometryData;
  vertexArea: Area;
  subMesh: SubMesh;
  indices: number[];

  updateBuffer(): void {
    const { data } = this;
    const { start, size } = this.vertexArea;
    data.updateVertexStart = Math.min(data.updateVertexStart, start);
    data.updateVertexLength = Math.max(data.updateVertexLength, start + size);
  }

  dispose?(): void {
    this.id = -1;
    this.data = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
