import { SubMesh } from "../graphic";
import { IPoolElement } from "../utils/ObjectPool";
import { VertexArea } from "./VertexArea";
import { PrimitiveChunk } from "./PrimitiveChunk";

/**
 * @internal
 */
export class SubPrimitiveChunk implements IPoolElement {
  chunk: PrimitiveChunk;
  vertexArea: VertexArea;
  subMesh: SubMesh;
  indices: number[];

  dispose?(): void {
    this.chunk = null;
    this.vertexArea = null;
    this.subMesh = null;
    this.indices = null;
  }
}
