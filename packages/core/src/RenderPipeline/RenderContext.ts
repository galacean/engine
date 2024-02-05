import { Matrix } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { VirtualCamera } from "../VirtualCamera";
import { Shader, ShaderProperty } from "../shader";
import { ShaderTagKey } from "../shader/ShaderTagKey";

/**
 * @internal
 * Rendering context.
 */
export class RenderContext {
  static vpMatrixProperty = ShaderProperty.getByName("camera_VPMat");
  static pipelineStageKey: ShaderTagKey = ShaderTagKey.getByName("pipelineStage");

  private static _viewMatrixProperty = ShaderProperty.getByName("camera_ViewMat");
  private static _projectionMatrixProperty = ShaderProperty.getByName("camera_ProjMat");
  private static _flipYProperty = ShaderProperty.getByName("camera_FlipY");
  private static _flipYProjectionMatrix = new Matrix();
  private static _flipYViewProjectionMatrix = new Matrix();

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader;
  replacementTag: ShaderTagKey;

  flipY = false;
  viewMatrix: Matrix;
  projectionMatrix: Matrix;
  viewProjectionMatrix: Matrix;

  applyVirtualCamera(virtualCamera: VirtualCamera, flipY = false): void {
    this.virtualCamera = virtualCamera;
    this.flipY = flipY;

    const shaderData = this.camera.shaderData;
    let { viewMatrix, projectionMatrix, viewProjectionMatrix } = virtualCamera;

    if (flipY) {
      projectionMatrix = RenderContext._flipYProjectionMatrix.copyFrom(projectionMatrix);
      viewProjectionMatrix = RenderContext._flipYViewProjectionMatrix.copyFrom(viewProjectionMatrix);
      projectionMatrix.elements[5] *= -1;
      const e = viewProjectionMatrix.elements;
      e[1] *= -1;
      e[5] *= -1;
      e[9] *= -1;
      e[13] *= -1;
    }

    this.viewMatrix = viewMatrix;
    this.projectionMatrix = projectionMatrix;
    this.viewProjectionMatrix = viewProjectionMatrix;

    shaderData.setMatrix(RenderContext._viewMatrixProperty, viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, viewProjectionMatrix);
    shaderData.setFloat(RenderContext._flipYProperty, this.flipY ? -1 : 1);
  }
}
