import { Matrix, Vector3 } from "@galacean/engine-math";
import { property } from "./clone/CloneManager";

/**
 * @internal
 */
export class VirtualCamera {
  @property
  isOrthographic: boolean = false;
  @property
  nearClipPlane: number = 0.1;
  @property
  farClipPlane: number = 100;
  position: Vector3 = new Vector3();
  viewMatrix: Matrix = new Matrix();
  projectionMatrix: Matrix = new Matrix();
  viewProjectionMatrix: Matrix = new Matrix();
  /** Only orth mode use. */
  forward: Vector3 = new Vector3();
}
