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

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader;
  replacementTag: ShaderTagKey;
  flipY = false;

  applyVirtualCamera(virtualCamera: VirtualCamera): void {
    this.virtualCamera = virtualCamera;
    const shaderData = this.camera.shaderData;
    const { viewMatrix, projectionMatrix, viewProjectionMatrix } = virtualCamera;

    if (this.flipY) {
      projectionMatrix.elements[5] *= -1;
      const e = viewProjectionMatrix.elements;
      e[1] *= -1;
      e[5] *= -1;
      e[9] *= -1;
      e[13] *= -1;
    }

    shaderData.setMatrix(RenderContext._viewMatrixProperty, viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, viewProjectionMatrix);
    shaderData.setFloat(RenderContext._flipYProperty, this.flipY ? -1 : 1);
  }
}
