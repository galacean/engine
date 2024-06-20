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

  dispose?(): void {
    this.id = -1;
    this.chunk = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
