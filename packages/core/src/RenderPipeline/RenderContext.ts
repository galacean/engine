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

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader;
  replacementTag: ShaderTagKey;

  applyVirtualCamera(virtualCamera: VirtualCamera): void {
    this.virtualCamera = virtualCamera;
    const shaderData = this.camera.shaderData;
    shaderData.setMatrix(RenderContext._viewMatrixProperty, virtualCamera.viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, virtualCamera.projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, virtualCamera.viewProjectionMatrix);
  }
}
