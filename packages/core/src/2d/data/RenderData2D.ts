import { Color, Vector2, Vector3 } from "@oasis-engine/math";

export class RenderData2D {
  /** @internal */
  positions: Vector3[];
  /** @internal */
  uvs: Vector2[];
  /** @internal */
  triangles: number[];
  /** @internal */
  color: Color;
}
