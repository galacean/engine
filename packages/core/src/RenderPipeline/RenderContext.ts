import { Camera } from "../Camera";
import { Shader } from "../shader";
import { ShaderTag } from "../shader/ShaderTag";
import { VirtualCamera } from "../VirtualCamera";

/**
 * @internal
 * Rendering context.
 */
export class RenderContext {
  static vpMatrixProperty = Shader.getPropertyByName("u_VPMat");
  static pipelineStageKey: ShaderTag = ShaderTag.getByName("PipelineStage");

  private static _viewMatrixProperty = Shader.getPropertyByName("u_viewMat");
  private static _projectionMatrixProperty = Shader.getPropertyByName("u_projMat");

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader;
  replacementTagKey: ShaderTag;
  pipelineStageValue: ShaderTag;

  applyVirtualCamera(virtualCamera: VirtualCamera): void {
    this.virtualCamera = virtualCamera;
    const shaderData = this.camera.shaderData;
    shaderData.setMatrix(RenderContext._viewMatrixProperty, virtualCamera.viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, virtualCamera.projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, virtualCamera.viewProjectionMatrix);
  }
}
