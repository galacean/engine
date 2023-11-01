import { Matrix, Quaternion, Rect, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { XRInput } from "./XRInput";

export class XRCamera extends XRInput {
  viewport: Rect = new Rect();
  projectionMatrix: Matrix = new Matrix();

  private _camera: Camera;

  set camera(camera: Camera) {
    this._camera = camera;
  }

  get camera(): Camera {
    return this._camera;
  }

  constructor() {
    super();
    this._pose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  }
}
