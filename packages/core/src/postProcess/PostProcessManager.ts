import { Engine } from "../Engine";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { Material } from "../material";
import { Shader } from "../shader";
import { RenderTarget, Texture2D, TextureFilterMode, TextureWrapMode } from "../texture";
import { BloomEffect, TonemappingEffect } from "./effects";

export class PostProcessManager {
  static readonly UBER_SHADER_NAME = "UberPost";

  private _swapRenderTarget: RenderTarget;

  /** @internal */
  _uberMaterial: Material;
  /** @internal */
  _bloomEffect: BloomEffect;
  /** @internal */
  _tonemappingEffect: TonemappingEffect;

  /**
   * Engine to which the current PostProcessManager belongs
   */
  get engine(): Engine {
    return this.scene.engine;
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {
    const engine = scene.engine;
    const uberShader = Shader.find(PostProcessManager.UBER_SHADER_NAME);
    const uberMaterial = new Material(scene.engine, uberShader);
    const depthState = uberMaterial.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    const bloomEffect = new BloomEffect(engine, uberMaterial);
    const tonemappingEffect = new TonemappingEffect(uberMaterial);

    this._uberMaterial = uberMaterial;
    this._bloomEffect = bloomEffect;
    this._tonemappingEffect = tonemappingEffect;
  }

  /**
   * @internal
   */
  _render(context: RenderContext) {
    const { camera, colorTarget } = context;
    const engine = this.engine;
    const bloomEffect = this._bloomEffect;
    const tonemappingEffect = this._tonemappingEffect;

    if (camera.enablePostProcess) {
      const viewport = camera.pixelViewport;

      this._swapRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._swapRenderTarget,
        viewport.width,
        viewport.height,
        camera._getInternalColorTextureFormat(),
        null,
        false,
        false,
        camera.msaaSamples,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      // Should blit to resolve the MSAA
      colorTarget._blitRenderTarget();
      const srcTexture = <Texture2D>colorTarget.getColorTexture();

      if (bloomEffect.enabled && bloomEffect.intensity > 0) {
        bloomEffect.onRender(context, srcTexture);
      }

      // if (this._tonemappingEffect.enabled) {
      //   this._tonemappingEffect.onRender(this._uberMaterial);
      // }

      PipelineUtils.blitTexture(engine, srcTexture, this._swapRenderTarget, 0, undefined, this._uberMaterial, 0);
      this._swapRenderTarget._blitRenderTarget();
      PipelineUtils.blitTexture(engine, <Texture2D>this._swapRenderTarget.getColorTexture(0), colorTarget);
    } else {
      if (this._swapRenderTarget) {
        this._swapRenderTarget.getColorTexture(0)?.destroy(true);
        this._swapRenderTarget.destroy(true);
        this._swapRenderTarget = null;
      }
    }
  }
}
