import { Vector3, Vector4 } from "@galacean/engine-math";
import { Texture2D } from "../../texture";
import { VertexData2D } from "../data/VertexData2D";

/**
 * @internal
 */
export class CharRenderData {
  static triangles: number[] = [0, 2, 1, 2, 0, 3];

  texture: Texture2D;
  /** x:Top y:Left z:Bottom w:Right */
  localPositions: Vector4 = new Vector4();
  renderData: VertexData2D;

  constructor() {
    const positions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    this.renderData = new VertexData2D(4, positions, null, CharRenderData.triangles, null);
  }
}
