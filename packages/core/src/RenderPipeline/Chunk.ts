import { Primitive, SubMesh } from "../graphic";
import { IPoolElement } from "../utils/Pool";
import { DynamicGeometryData } from "./DynamicGeometryData";

/**
 * @internal
 */
export class Chunk implements IPoolElement {
  id = -1;
  data: DynamicGeometryData;
  primitive: Primitive;
  subMesh: SubMesh;
  indices: number[];

  dispose?(): void {
    this.id = -1;
    this.data = null;
    this.subMesh = null;
    this.indices = null;
  }
}
