import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";

export interface RenderData2D {
  /** @internal */
  vertexCount: number;
  /** @internal */
  positions: Vector3[];
  /** @internal */
  uvs: Vector2[];
  /** @internal */
  triangles: number[];
  /** @internal */
  color: Color;
  /** @internal */
  texture: Texture2D;
}
