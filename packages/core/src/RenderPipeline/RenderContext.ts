import { Matrix } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Shader } from "../shader";

/**
 * @internal
 * Rendering context.
 */
export class RenderContext {
  /** @internal */
  static _vpMatrixProperty = Shader.getPropertyByName("u_VPMat");

  private static _viewMatrixProperty = Shader.getPropertyByName("u_viewMat");
  private static _projectionMatrixProperty = Shader.getPropertyByName("u_projMat");

  camera: Camera;
  viewMatrix: Matrix;
  projectionMatrix: Matrix;
  viewProjectMatrix: Matrix;

  applyViewProjectMatrix(viewMatrix: Matrix, projectionMatrix: Matrix, viewProjectMatrix: Matrix): void {
    const shaderData = this.camera.shaderData;
    shaderData.setMatrix(RenderContext._viewMatrixProperty, viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, projectionMatrix);
    shaderData.setMatrix(RenderContext._vpMatrixProperty, viewProjectMatrix);

    this.viewMatrix = viewMatrix;
    this.projectionMatrix = projectionMatrix;
    this.viewProjectMatrix = viewProjectMatrix;
  }
}
