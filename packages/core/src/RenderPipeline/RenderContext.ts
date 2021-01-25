import { Matrix } from "@oasis-engine/math";
import { Camera } from "../Camera";

/**
 * Rendering context.
 */
export class RenderContext {
  private static _renderContext: RenderContext = new RenderContext();

  /**
   * @internal
   */
  static _getRenderContext(camera: Camera): RenderContext {
    const context = RenderContext._renderContext;
    context._camera = camera;
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, context._viewProjectMatrix);
    return context;
  }

  /** @internal */
  _camera: Camera;
  /** @internal */
  _viewProjectMatrix: Matrix = new Matrix();
}
