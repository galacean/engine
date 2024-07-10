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
   * Whether has active post process effect.
   */
  get hasActiveEffect(): boolean {
    const bloomEffect = this._bloomEffect;
    const tonemappingEffect = this._tonemappingEffect;

    const useBloom = bloomEffect.enabled;
    const useTonemapping = tonemappingEffect.enabled;
    const hasActiveEffect = useBloom || useTonemapping;

    return hasActiveEffect;
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
  _render(context: RenderContext, srcTarget: RenderTarget): void {
    const camera = context.camera;
    const engine = camera.engine;
    const destination = camera.renderTarget;

    // Should blit to resolve the MSAA
    srcTarget._blitRenderTarget();
    const srcTexture = <Texture2D>srcTarget.getColorTexture();
    const bloomEffect = this._bloomEffect;

    if (bloomEffect.enabled) {
      bloomEffect.onRender(context, srcTexture);
    }

    // Done with Uber, blit it
    if (destination === srcTarget) {
      // Swap and blit to camera.renderTarget
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
      PipelineUtils.blitTexture(engine, srcTexture, this._swapRenderTarget, 0, undefined, this._uberMaterial);
      this._swapRenderTarget._blitRenderTarget();
      PipelineUtils.blitTexture(
        engine,
        <Texture2D>this._swapRenderTarget.getColorTexture(0),
        destination,
        0,
        camera.viewport
      );
    } else if (!destination) {
      // Blit to screen
      PipelineUtils.blitTexture(engine, srcTexture, null, 0, camera.viewport, this._uberMaterial);
    } else {
      // Blit to camera.renderTarget
      PipelineUtils.blitTexture(engine, srcTexture, destination, 0, camera.viewport, this._uberMaterial);
    }
  }

  /**
   * @internal
   */
  _releaseSwapRenderTarget(): void {
    if (this._swapRenderTarget) {
      this._swapRenderTarget.getColorTexture(0)?.destroy(true);
      this._swapRenderTarget.destroy(true);
      this._swapRenderTarget = null;
    }
  }
}
