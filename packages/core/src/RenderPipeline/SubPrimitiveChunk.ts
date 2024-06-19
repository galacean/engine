import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { Area } from "./Area";
import { PrimitiveChunk } from "./PrimitiveChunk";

/**
 * @internal
 */
export class SubPrimitiveChunk implements IPoolElement {
  chunk: PrimitiveChunk;
  vertexArea: Area;
  subMesh: SubMesh;
  indices: number[];

  dispose?(): void {
    this.chunk = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
