import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Texture2D } from "../../texture";
import { IPoolElement } from "../../utils/ObjectPool";

/**
 * @internal
 */
export class CharRenderInfo implements IPoolElement {
  static triangles = [0, 2, 1, 2, 0, 3];

  texture: Texture2D;
  /** x:Top y:Left z:Bottom w:Right */
  localPositions = new Vector4();
  uvs: Array<Vector2>;
  indexInChunk: number;

  dispose(): void {
    this.texture = null;
    this.localPositions = null;
    this.uvs = null;
  }
}
