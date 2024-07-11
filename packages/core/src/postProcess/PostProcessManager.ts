import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { Material } from "../material";
import { Shader } from "../shader";
import { RenderTarget, Texture2D } from "../texture";
import { BloomEffect, TonemappingEffect } from "./effects";

export class PostProcessManager {
  static readonly UBER_SHADER_NAME = "UberPost";

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

    // Done with Uber, blit it
    PipelineUtils.blitTexture(engine, srcTexture, destTarget, 0, camera.viewport, this._uberMaterial);
  }
}
