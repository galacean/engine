import { Color } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { IHardwareRenderer } from "../renderingHardwareInterface";
import { ShaderMacro } from "../shader";
import { TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { CullingResults } from "./CullingResults";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * @internal
 * Shared prepass producing `DepthOnly` or `DepthNormals` attachments.
 */
export class DepthPrepass extends PipelinePass {
  private static readonly _packedNormalMacro = ShaderMacro.getByName("CAMERA_DEPTH_NORMALS_PACKED_OCT8");
  private static readonly _clearColorDepth = new Color(0, 0, 0, 0);

  /**
   * Resolve the `DepthNormals` color attachment format for the current hardware capabilities.
   */
  static resolveNormalRoughnessFormat(rhi: IHardwareRenderer, preferHighPrecision: boolean): TextureFormat {
    return preferHighPrecision && rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16B16A16_SFloat)
      ? TextureFormat.R16G16B16A16_SFloat
      : TextureFormat.R8G8B8A8_UNorm;
  }

  renderTarget: RenderTarget | null;
  private _normalRoughnessFormat: TextureFormat | null = null;

  onConfig(camera: Camera, normalRoughnessFormat: TextureFormat | null = null): void {
    const { width, height } = camera.pixelViewport;
    this._normalRoughnessFormat = normalRoughnessFormat;

    const renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this.renderTarget,
      width,
      height,
      normalRoughnessFormat,
      TextureFormat.Depth24,
      true,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Point
    );

    this.renderTarget = renderTarget;
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    const { engine, renderTarget, _normalRoughnessFormat: normalFormat } = this;
    const camera = context.camera;
    const macros = engine._macroCollection;
    const hasNormals = normalFormat !== null;
    const packNormals = normalFormat === TextureFormat.R8G8B8A8_UNorm;

    context.setRenderTarget(renderTarget, PipelineUtils.defaultViewport, 0);
    engine._hardwareRenderer.clearRenderTarget(
      engine,
      hasNormals ? CameraClearFlags.ColorDepth : CameraClearFlags.Depth,
      hasNormals ? DepthPrepass._clearColorDepth : null
    );
    engine._renderCount++;

    if (packNormals) {
      macros.enable(DepthPrepass._packedNormalMacro);
    }
    const stage = hasNormals ? PipelineStage.DepthNormals : PipelineStage.DepthOnly;
    cullingResults.opaqueQueue.render(context, stage);
    cullingResults.alphaTestQueue.render(context, stage);
    if (packNormals) {
      macros.disable(DepthPrepass._packedNormalMacro);
    }

    camera.shaderData.setTexture(
      Camera._cameraDepthNormalsTextureProperty,
      hasNormals ? renderTarget!.getColorTexture(0) : null
    );
    camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, renderTarget!.depthTexture);
  }

  release(): void {
    this._normalRoughnessFormat = null;
    const renderTarget = this.renderTarget;
    if (renderTarget) {
      this.engine._renderTargetPool.freeRenderTarget(renderTarget);
      this.renderTarget = null;
    }
  }
}
