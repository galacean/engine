import { Color, Vector2, Vector3 } from "@oasis-engine/math";

/**
 * @internal
 */
export class RenderData2D {
  constructor(
    public vertexCount: number,
    public positions: Vector3[],
    public uvs: Vector2[],
    public triangles: number[] = null,
    public color: Color = null
  ) {}
}
