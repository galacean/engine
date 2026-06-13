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
  // The matrices clone together with Camera's `_isCustomViewMatrix` / `_isCustomProjectionMatrix`
  // flags: when a flag is true the getter short-circuits to the stored matrix and never recomputes,
  // so a clone carrying the flag without the matrix would render with an identity matrix forever.
  // For non-custom cameras the cloned values are recomputed on first use (dirty flags start true).
  @property
  viewMatrix: Matrix = new Matrix();
  @property
  projectionMatrix: Matrix = new Matrix();
  viewProjectionMatrix: Matrix = new Matrix();
  /** Only orth mode use. */
  forward: Vector3 = new Vector3();
}
