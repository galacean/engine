import { Color, Vector2, Vector3 } from "@galacean/engine-math";

/**
 * @internal
 */
export class VertexData2D {
  constructor(
    public vertexCount: number,
    public positions: Vector3[],
    public uvs: Vector2[],
    public triangles: number[] = null,
    public color: Color = null
  ) {}
}
