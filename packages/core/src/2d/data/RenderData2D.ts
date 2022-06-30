import { Color, Vector2, Vector3 } from "@oasis-engine/math";

/**
 * @internal
 */
export interface RenderData2D {
  vertexCount: number;
  positions: Vector3[];
  uvs: Vector2[];
  triangles: number[];
  color: Color;
}
