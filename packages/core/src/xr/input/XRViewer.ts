import { Matrix, Rect } from "@galacean/engine-math";
import { XRInput } from "./XRInput";
import { Camera } from "../../Camera";
import { Texture2D } from "../../texture";

export class XRViewer extends XRInput {
  viewport: Rect = new Rect();
  projectionMatrix: Matrix = new Matrix();
  displayTransform: Matrix = new Matrix();
  yTexture: Texture2D;
  uvTexture: Texture2D;

  private _camera: Camera;

  set camera(camera: Camera) {
    this._camera = camera;
  }

  get camera(): Camera {
    return this._camera;
  }
}
