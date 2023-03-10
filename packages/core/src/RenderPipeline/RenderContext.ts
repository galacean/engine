import { Camera } from "../Camera";
import { Shader, ShaderProperty } from "../shader";
import { ShaderTag } from "../shader/ShaderTag";
import { VirtualCamera } from "../VirtualCamera";

/**
 * @internal
 * Rendering context.
 */
export class RenderContext {
  static vpMatrixProperty = ShaderProperty.getByName("u_VPMat");
  static pipelineStageKey: ShaderTag = ShaderTag.getByName("pipelineStage");

  private static _viewMatrixProperty = ShaderProperty.getByName("u_viewMat");
  private static _projectionMatrixProperty = ShaderProperty.getByName("u_projMat");

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader;
  replacementTagKey: ShaderTag;
  pipelineStageValue: string;

  applyVirtualCamera(virtualCamera: VirtualCamera): void {
    this.virtualCamera = virtualCamera;
    const shaderData = this.camera.shaderData;
    shaderData.setMatrix(RenderContext._viewMatrixProperty, virtualCamera.viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, virtualCamera.projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, virtualCamera.viewProjectionMatrix);
  }
}
