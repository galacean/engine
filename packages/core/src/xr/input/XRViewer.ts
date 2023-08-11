import { Matrix, Rect } from "@galacean/engine-math";
import { XRInput } from "./XRInput";
import { Camera } from "../../Camera";

export class XRViewer extends XRInput {
  viewport: Rect = new Rect();
  projectionMatrix: Matrix = new Matrix();
  displayTransform: Matrix = new Matrix();

  private _camera: Camera;
  private _yTexture: WebGLTexture;
  private _uvTexture: WebGLTexture;

  get texture(): { yTexture: WebGLTexture; uvTexture: WebGLTexture } {
    return null;
  }

  attachCamera(camera: Camera): void {
    this._camera = camera;
  }

  detachCamera() {
    this._camera = null;
  }
}
