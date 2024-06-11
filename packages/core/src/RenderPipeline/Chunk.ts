import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ReturnableObjectPool";
import { DynamicGeometryData, Area } from "./DynamicGeometryData";

/**
 * @internal
 */
export class Chunk implements IPoolElement {
  id = -1;
  data: DynamicGeometryData;
  vertexArea: Area;
  subMesh: SubMesh;
  indices: number[];

  dispose?(): void {
    this.id = -1;
    this.data = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
