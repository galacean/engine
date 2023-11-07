import { Matrix, Quaternion, Rect, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { XRInput } from "./XRInput";

export class XRCamera extends XRInput {
  /** The viewport of the camera. */
  viewport: Rect = new Rect();
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix = new Matrix();

  private _camera: Camera;

  /**
   * Returns the associated virtual camera.
   */
  get camera(): Camera {
    return this._camera;
  }
  set camera(camera: Camera) {
    this._camera = camera;
  }

  constructor() {
    super();
    this._pose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  }
}
