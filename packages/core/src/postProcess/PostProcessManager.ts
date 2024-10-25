import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { Scene } from "../Scene";
import { Material } from "../material";
import { Shader } from "../shader";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { PostProcess } from "./PostProcess";
import { PostProcessEffect, RenderPostProcessEvent } from "./PostProcessEffect";

interface ISortedEffects {
  [RenderPostProcessEvent.BeforeUber]: PostProcessEffect[];
  [RenderPostProcessEvent.InUber]: PostProcessEffect[];
  [RenderPostProcessEvent.AfterUber]: PostProcessEffect[];
}

/**
 * A global manager of the PostProcess.
 */
export class PostProcessManager {
  static readonly UBER_SHADER_NAME = "UberPost";

  /** @internal */
  _uberMaterial: Material;

  private _activePostProcesses: PostProcess[] = [];
  private _postProcessNeedSorting = false;
  private _hasActiveEffect = false;
  private _activeStateChangeFlag = false;
  private _useSwapRenderTarget = false;
  private _swapRenderTarget: RenderTarget;
  private _srcRenderTarget: RenderTarget;
  private _destRenderTarget: RenderTarget;
  private _sortedEffects: ISortedEffects = {
    [RenderPostProcessEvent.BeforeUber]: [],
    [RenderPostProcessEvent.InUber]: [],
    [RenderPostProcessEvent.AfterUber]: []
  };
  private _remainEffectCount = 0;

  /**
   * Whether has active post process effect.
   */
  get hasActiveEffect(): boolean {
    if (!this._activeStateChangeFlag) {
      return this._hasActiveEffect;
    }
    this._activeStateChangeFlag = false;

    for (let i = 0; i < this._activePostProcesses.length; i++) {
      const postProcess = this._activePostProcesses[i];
      if (postProcess.enabled) {
        const effects = postProcess._effects;
        for (let j = 0; j < effects.length; j++) {
          if (effects[j].enabled) {
            this._hasActiveEffect = true;
            return true;
          }
        }
      }
    }

    this._hasActiveEffect = false;
    return false;
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {
    const uberShader = Shader.find(PostProcessManager.UBER_SHADER_NAME);
    const uberMaterial = new Material(scene.engine, uberShader);
    const depthState = uberMaterial.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    this._uberMaterial = uberMaterial;
  }

  addPostProcess(postProcess: PostProcess): void {
    this._activePostProcesses.push(postProcess);
    this._setActiveStateDirty();
    this._postProcessNeedSorting = true;
  }

  removePostProcess(postProcess: PostProcess): void {
    const index = this._activePostProcesses.indexOf(postProcess);

    if (index >= 0) {
      this._activePostProcesses.splice(index, 1);
      this._setActiveStateDirty();
      this._postProcessNeedSorting = true;
    }
  }

  sortPostProcess(): void {
    if (this._postProcessNeedSorting) {
      const postProcesses = this._activePostProcesses;
      if (postProcesses.length) {
        postProcesses.sort((a, b) => a.priority - b.priority);
      }
      this._postProcessNeedSorting = false;
    }
  }

  render(camera: Camera, srcRenderTarget: RenderTarget, destRenderTarget: RenderTarget): void {
    const engine = camera.engine;
    const list = this._sortedEffects;
    const beforeUber = list[RenderPostProcessEvent.BeforeUber];
    const inUber = list[RenderPostProcessEvent.InUber];
    const afterUber = list[RenderPostProcessEvent.AfterUber];

    this._srcRenderTarget = srcRenderTarget;
    this._destRenderTarget = destRenderTarget;

    // Should blit to resolve the MSAA
    srcRenderTarget._blitRenderTarget();

    this._initSwapRenderTarget(camera);
    this._sortEffects(camera.postProcessMask, beforeUber, inUber, afterUber);

    for (let i = 0; i < beforeUber.length; i++) {
      const effect = beforeUber[i];
      effect.onRender(camera, this._getSourceTexture(), this._getDestRenderTarget());
      this._swapRT();
      this._remainEffectCount--;
    }

    for (let i = 0; i < inUber.length; i++) {
      const effect = inUber[i];
      effect.onRender(camera, this._getSourceTexture(), this._getDestRenderTarget());
      this._remainEffectCount--;
    }

    Blitter.blitTexture(
      engine,
      this._getSourceTexture(),
      this._getDestRenderTarget(),
      0,
      camera.viewport,
      this._uberMaterial
    );

    for (let i = 0; i < afterUber.length; i++) {
      const effect = afterUber[i];
      this._swapRT();
      effect.onRender(camera, this._getSourceTexture(), this._getDestRenderTarget());
      this._remainEffectCount--;
    }

    // Done with Uber, blit it
    const currentSource = this._getSourceRenderTarget();
    if (currentSource !== destRenderTarget) {
      Blitter.blitTexture(engine, this._getSourceTexture(), destRenderTarget, 0, camera.viewport, this._uberMaterial);
    }
  }

  /**
   * @internal
   */
  _setActiveStateDirty(): void {
    this._activeStateChangeFlag = true;
  }

  /**
   * @internal
   */
  _releaseSwapRenderTarget(): void {
    const swapRenderTarget = this._swapRenderTarget;
    if (swapRenderTarget) {
      swapRenderTarget.getColorTexture(0)?.destroy(true);
      swapRenderTarget.destroy(true);
      this._swapRenderTarget = null;
    }
  }

  private _sortEffects(
    postProcessMask: Layer,
    beforeUber: PostProcessEffect[],
    inUber: PostProcessEffect[],
    afterUber: PostProcessEffect[]
  ): void {
    let globalProcessed = false;
    const postProcesses = this._activePostProcesses;

    beforeUber.length = inUber.length = afterUber.length = 0;
    this._remainEffectCount = 0;

    for (let i = postProcesses.length - 1; i >= 0; i--) {
      const postProcess = postProcesses[i];

      if (!postProcess.enabled) {
        continue;
      }

      if (!(postProcessMask & postProcess.layer)) {
        continue;
      }

      if (postProcess.isGlobal) {
        if (globalProcessed) {
          continue;
        }
        globalProcessed = true;
      }

      const effects = postProcess._effects;
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        if (!effect.enabled) {
          continue;
        }
        if (effect.renderEvent === RenderPostProcessEvent.BeforeUber) {
          beforeUber.push(effect);
          this._remainEffectCount++;
        } else if (effect.renderEvent === RenderPostProcessEvent.InUber) {
          inUber.push(effect);
          this._remainEffectCount++;
        } else if (effect.renderEvent === RenderPostProcessEvent.AfterUber) {
          afterUber.push(effect);
          this._remainEffectCount++;
        }
      }
    }
  }

  private _initSwapRenderTarget(camera: Camera) {
    const viewport = camera.pixelViewport;
    const swapRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.scene.engine,
      this._swapRenderTarget,
      viewport.width,
      viewport.height,
      camera._getInternalColorTextureFormat(),
      TextureFormat.Depth24Stencil8,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );

    this._swapRenderTarget = swapRenderTarget;
    this._useSwapRenderTarget = false;
  }

  private _swapRT(): void {
    this._useSwapRenderTarget = !this._useSwapRenderTarget;
  }

  private _getSourceTexture(): Texture2D {
    return this._getSourceRenderTarget().getColorTexture(0) as Texture2D;
  }

  private _getSourceRenderTarget(): RenderTarget {
    return this._useSwapRenderTarget ? this._swapRenderTarget : this._srcRenderTarget;
  }

  private _getDestRenderTarget(): RenderTarget {
    // Render to the destRenderTarget if this is the last effect
    if (this._remainEffectCount <= 1) {
      return this._destRenderTarget;
    } else {
      return this._useSwapRenderTarget ? this._srcRenderTarget : this._swapRenderTarget;
    }
  }
}
