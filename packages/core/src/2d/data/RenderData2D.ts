import { Vector2, Vector3 } from "@oasis-engine/math";

export class RenderData2D {
  /** @internal */
  _positions: Vector3[] = new Array<Vector3>();
  /** @internal */
  _uv: Vector2[] = new Array<Vector2>();
  /** @internal */
  _triangles: number[] = new Array<number>();
}
