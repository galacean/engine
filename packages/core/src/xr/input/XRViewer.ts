import { Matrix, Rect } from "@galacean/engine-math";
import { XRInputDevice } from "./XRInputDevice";
import { Camera } from "../../Camera";

export class XRViewer extends XRInputDevice {
  viewport: Rect = new Rect();
  projectionMatrix: Matrix = new Matrix();
  displayTransform: Matrix = new Matrix();

  private _camera: Camera;
  private _yTexture: WebGLTexture;
  private _uvTexture: WebGLTexture;

  get texture(): { yTexture: WebGLTexture; uvTexture: WebGLTexture } {
    return { yTexture: this._yTexture, uvTexture: this._uvTexture };
  }

  attachCamera(camera: Camera): void {
    this._camera = camera;
  }

  detachCamera() {
    this._camera = null;
  }

  get camera(): Camera {
    return this._camera;
  }
}
