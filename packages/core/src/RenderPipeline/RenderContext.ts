import { Camera } from "../Camera";
import { Matrix, Vector4, Vector3 } from "@alipay/o3-math";

/**
 * 渲染上下文。
 */
export class RenderContext {
  private static _renderContext: RenderContext = new RenderContext();

  static _getRenderContext(camera: Camera): RenderContext {
    const context = RenderContext._renderContext;
    context.camera = camera;
    context.viewport = camera.viewport;
    context.cameraPosition = camera.entity.transform.worldPosition;
    context.inverseViewMatrix = camera.inverseViewMatrix;
    context.inverseProjectionMatrix = camera.inverseProjectionMatrix;
    context.viewMatrix = camera.viewMatrix;
    context.projectionMatrix = camera.projectionMatrix;
    Matrix.multiply(context.projectionMatrix, context.viewMatrix, context.viewProjectMatrix);
    return this._renderContext;
  }

  camera: Camera;
  viewMatrix: Matrix;
  projectionMatrix: Matrix;
  viewProjectMatrix: Matrix = new Matrix();
  inverseViewMatrix: Matrix;
  inverseProjectionMatrix: Matrix;
  viewport: Vector4;
  cameraPosition: Vector3;
}
