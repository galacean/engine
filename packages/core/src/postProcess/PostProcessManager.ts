import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Material } from "../material";
import { BlendFactor, BlendOperation, Shader } from "../shader";
import { RenderTarget, Texture2D } from "../texture";
import { BloomEffect, TonemappingEffect } from "./effects";

/**
 * @internal
 */
export class _PostProcessManager {
  static readonly UBER_SHADER_NAME = "UberPost";

  /**
   * Whether the post process manager is active.
   */
  isActive = true;

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
    return this.isActive && (this._bloomEffect.enabled || this._tonemappingEffect.enabled);
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {
    const uberShader = Shader.find(_PostProcessManager.UBER_SHADER_NAME);
    const uberMaterial = new Material(scene.engine, uberShader);
    const depthState = uberMaterial.renderState.depthState;
    const blendState = uberMaterial.renderState.blendState.targetBlendState;

    blendState.enabled = true;
    blendState.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    blendState.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    blendState.sourceAlphaBlendFactor = BlendFactor.One;
    blendState.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    blendState.colorBlendOperation = blendState.alphaBlendOperation = BlendOperation.Add;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    const bloomEffect = new BloomEffect(uberMaterial);
    const tonemappingEffect = new TonemappingEffect(uberMaterial);

    this._uberMaterial = uberMaterial;
    this._bloomEffect = bloomEffect;
    this._tonemappingEffect = tonemappingEffect;
  }

  /**
   * @internal
   */
  _render(context: RenderContext, srcTarget: RenderTarget, destTarget: RenderTarget): void {
    const camera = context.camera;
    const engine = camera.engine;

    // Should blit to resolve the MSAA
    srcTarget._blitRenderTarget();
    const srcTexture = <Texture2D>srcTarget.getColorTexture();
    const bloomEffect = this._bloomEffect;

    if (bloomEffect.enabled) {
      bloomEffect.onRender(context, srcTexture);
    }

    this._uberMaterial.renderState.blendState.targetBlendState.enabled = !(
      context.camera.clearFlags & CameraClearFlags.Color
    );

    // Done with Uber, blit it
    PipelineUtils.blitTexture(engine, srcTexture, destTarget, 0, camera.viewport, this._uberMaterial);
  }
}
