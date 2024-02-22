import { Camera, Downsampling } from "../Camera";
import { Engine } from "../Engine";
import { Texture, Texture2D, TextureFilterMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { CullingResults } from "./CullingResults";
import { PipelinePass } from "./PipelinePass";
import { PipelineUtils } from "./PipelineUtils";
import { RenderContext } from "./RenderContext";

/**
 * @internal
 * Opaque texture pass.
 */
export class OpaqueTexturePass extends PipelinePass {
  private _cameraColorTexture: Texture;
  private _renderTarget: RenderTarget;

  constructor(engine: Engine) {
    super(engine);
  }

  onConfig(camera: Camera, cameraColorTexture: Texture): void {
    this._cameraColorTexture = cameraColorTexture;

    const downsampling = camera.opaqueTextureDownsampling;
    const isNoDownsampling = downsampling === Downsampling.None;

    const viewport = camera.pixelViewport;
    const sizeScale = isNoDownsampling ? 1.0 : downsampling === Downsampling.TwoX ? 0.5 : 0.25;
    const opaqueRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this._engine,
      this._renderTarget,
      viewport.width * sizeScale,
      viewport.height * sizeScale,
      TextureFormat.R8G8B8A8,
      null,
      false,
      false,
      1
    );

    const colorTexture = opaqueRenderTarget.getColorTexture(0);
    colorTexture.wrapModeU = colorTexture.wrapModeV = TextureWrapMode.Clamp;
    colorTexture.filterMode = isNoDownsampling ? TextureFilterMode.Point : TextureFilterMode.Bilinear;
    this._renderTarget = opaqueRenderTarget;
  }

  onRender(context: RenderContext, _: CullingResults): void {
    PipelineUtils.blitTexture(this._engine, <Texture2D>this._cameraColorTexture, this._renderTarget);
    context.camera.shaderData.setTexture(Camera._cameraOpaqueTextureProperty, this._renderTarget.getColorTexture(0));
  }
}
