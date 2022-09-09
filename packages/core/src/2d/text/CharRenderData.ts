import { Vector3, Vector4 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";
import { RenderData2D } from "../data/RenderData2D";

/**
 * @internal
 */
export class CharRenderData {
  static triangles: number[] = [0, 2, 1, 2, 0, 3];

  texture: Texture2D;
  /** x:Top y:Left z:Bottom w:Right */
  localPositions: Vector4 = new Vector4();
  renderData: RenderData2D;

  constructor() {
    const positions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    this.renderData = new RenderData2D(4, positions, null, CharRenderData.triangles, null);
  }
}
