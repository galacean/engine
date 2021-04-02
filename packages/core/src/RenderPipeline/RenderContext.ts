import { Matrix } from "@oasis-engine/math";
import { Camera } from "../Camera";

/**
 * Rendering context.
 */
export class RenderContext {
  /** @internal */
  _camera: Camera;
  /** @internal */
  _viewProjectMatrix: Matrix = new Matrix();

  /**
   * @internal
   */
  _setContext(camera: Camera): void {
    this._camera = camera;
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, this._viewProjectMatrix);
  }
}
