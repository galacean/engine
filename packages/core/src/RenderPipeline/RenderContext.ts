import { Color, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { VirtualCamera } from "../VirtualCamera";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Shader, ShaderProperty } from "../shader";
import { ShaderTagKey } from "../shader/ShaderTagKey";
import { RenderTarget, TextureCubeFace } from "../texture";
import { CullingResults } from "./CullingResults";

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

  /**
   * Configure the camera clear flag and clear color.
   * @param clearFLag
   * @param color
   */
  configureClear(clearFLag: CameraClearFlags, color: Color): void {
    const engine = this.camera.engine;
    const rhi = engine._hardwareRenderer;
    rhi.clearRenderTarget(engine, clearFLag, color);
  }

  configureTarget(renderTarget: RenderTarget, viewport: Vector4, mipLevel: number, cubeFace?: TextureCubeFace): void {
    const engine = this.camera.engine;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, viewport, mipLevel);
    renderTarget?._setRenderTargetInfo(cubeFace, mipLevel);
  }

  setViewport(viewport: Vector4): void {
    // rhi.viewport(x, y, shadowTileResolution, shadowTileResolution);
  }

  drawRenderers(context: RenderContext, camera: Camera, cullingResults: CullingResults): void {
    const { engine, renderTarget, scene } = camera;
    const { background } = scene;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(renderTarget, camera.viewport, undefined);
    renderTarget?._setRenderTargetInfo(undefined, undefined);
    cullingResults.opaqueQueue.render(context, camera, Layer.Everything);
    cullingResults.alphaTestQueue.render(context, camera, Layer.Everything);

    const clearFlags = camera.clearFlags;
    const color = background.solidColor;
    if (clearFlags !== CameraClearFlags.None) {
      rhi.clearRenderTarget(camera.engine, clearFlags, color);
    }
  }
}
