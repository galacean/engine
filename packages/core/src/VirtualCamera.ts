import { Matrix, Vector3 } from "@galacean/engine-math";
import { CloneMode } from "./clone/enums/CloneMode";
import { ignoreClone, defaultCloneMode } from "./clone/CloneManager";

/**
 * @internal
 */
@defaultCloneMode(CloneMode.Deep)
export class VirtualCamera {
  isOrthographic: boolean = false;
  nearClipPlane: number = 0.1;
  farClipPlane: number = 100;
  @ignoreClone
  position: Vector3 = new Vector3();
  @ignoreClone
  viewMatrix: Matrix = new Matrix();
  @ignoreClone
  projectionMatrix: Matrix = new Matrix();
  @ignoreClone
  viewProjectionMatrix: Matrix = new Matrix();
  /** Only orth mode use. */
  @ignoreClone
  forward: Vector3 = new Vector3();
}
