import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { Scene } from "../Scene";
import { Logger } from "../base";
import { Material } from "../material";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { PostProcess } from "./PostProcess";
import { PostProcessEffect } from "./PostProcessEffect";
import { PostProcessPass } from "./PostProcessPass";

/**
 * A global manager of the PostProcess.
 */
export class PostProcessManager {
  /** @internal */
  _uberMaterial: Material;
  /** @internal */
  _postProcessNeedSorting = false;
  /** @internal */
  _postProcessPassNeedSorting = false;

  private _activePostProcesses: PostProcess[] = [];
  private _activePostProcessPasses: PostProcessPass[] = [];
  private _hasActiveEffect = false;
  private _activeStateChangeFlag = false;
  private _swapRenderTarget: RenderTarget;
  private _srcRenderTarget: RenderTarget;
  private _destRenderTarget: RenderTarget;
  private _currentSourceRenderTarget: RenderTarget;
  private _currentDestRenderTarget: RenderTarget;
  private _postProcessEffectInstanceMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _defaultPostProcessEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _remainPassCount = 0;

  /**
   * Whether has active post process effect.
   */
  get hasActiveEffect(): boolean {
    if (!this._activeStateChangeFlag) {
      return this._hasActiveEffect;
    }
    this._activeStateChangeFlag = false;

    if (this._activePostProcessPasses.length) {
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
    }

    this._hasActiveEffect = false;
    return false;
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {}

  /**
   * Add a post process pass to the manager.
   * @param pass - Post process pass to add
   */
  addPostProcessPass(pass: PostProcessPass) {
    const passes = this._activePostProcessPasses;
    const index = passes.indexOf(pass);

    if (index === -1) {
      if (pass.isActive) {
        pass._postProcessManager = this;
        this._activePostProcessPasses.push(pass);
        this._postProcessPassNeedSorting = true;
        this._activeStateChangeFlag = true;
      }
    } else {
      Logger.error(`pass "${pass.constructor.name}" already exists in the post process manager.`);
    }
  }

  /**
   * @internal
   */
  _removePostProcessPass(pass: PostProcessPass) {
    const passes = this._activePostProcessPasses;
    const index = passes.indexOf(pass);

    if (index >= 0) {
      passes.splice(index, 1);
      this._postProcessPassNeedSorting = true;
      this._activeStateChangeFlag = true;
    }
  }

  /**
   * @internal
   */
  _addPostProcess(postProcess: PostProcess): void {
    this._activePostProcesses.push(postProcess);
    this._setActiveStateDirty();
    this._postProcessNeedSorting = true;
  }

  /**
   * @internal
   */
  _removePostProcess(postProcess: PostProcess): void {
    const index = this._activePostProcesses.indexOf(postProcess);
    if (index >= 0) {
      this._activePostProcesses.splice(index, 1);
      this._setActiveStateDirty();
      this._postProcessNeedSorting = true;
    }
  }

  /**
   * @internal
   */
  _getEffectInstance<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    return this._postProcessEffectInstanceMap.get(type) as InstanceType<T>;
  }

  /**
   * @internal
   */
  _render(camera: Camera, srcRenderTarget: RenderTarget, destRenderTarget: RenderTarget): void {
    this._srcRenderTarget = srcRenderTarget;
    this._destRenderTarget = destRenderTarget;

    // Should blit to resolve the MSAA
    srcRenderTarget._blitRenderTarget();

    this._update(camera.postProcessMask);

    this._remainPassCount = this._activePostProcessPasses.length;
    this._initSwapRenderTarget(camera);

    for (let i = 0; i < this._activePostProcessPasses.length; i++) {
      const pass = this._activePostProcessPasses[i];
      pass.onRender(camera, this._getCurrentSourceTexture(), this._currentDestRenderTarget);
      this._remainPassCount--;
      this._swapRT();
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

  private _sortPostProcess(): void {
    if (this._postProcessNeedSorting) {
      const postProcesses = this._activePostProcesses;
      if (postProcesses.length) {
        postProcesses.sort((a, b) => a.priority - b.priority);
      }
      this._postProcessNeedSorting = false;
    }
  }

  private _sortPostProcessPass(): void {
    if (this._postProcessPassNeedSorting) {
      const passes = this._activePostProcessPasses;
      if (passes.length) {
        passes.sort((a, b) => a.event - b.event);
      }
      this._postProcessPassNeedSorting = false;
    }
  }

  private _resetDefaultValue() {
    this._postProcessEffectInstanceMap.forEach((effectInstance, typeofEffectInstance) => {
      let defaultEffect = this._defaultPostProcessEffectMap.get(typeofEffectInstance);

      if (!defaultEffect) {
        defaultEffect = new typeofEffectInstance(effectInstance.postProcess);
        defaultEffect._setActive(true);
        this._defaultPostProcessEffectMap.set(typeofEffectInstance, defaultEffect);
      }

      // Reset effectInstance's value by defaultEffect
      defaultEffect.lerp(effectInstance, 1);
    });
  }

  private _update(postProcessMask: Layer) {
    // Start by resetting post process effect instance to default values
    this._resetDefaultValue();

    // Sort post process and post process pass
    this._sortPostProcess();
    this._sortPostProcessPass();

    for (let i = 0; i < this._activePostProcesses.length; i++) {
      const postProcess = this._activePostProcesses[i];
      if (!postProcess.enabled) {
        continue;
      }

      if (!(postProcessMask & postProcess.layer)) {
        continue;
      }

      const effects = postProcess._effects;
      for (let j = 0; j < effects.length; j++) {
        const effect = effects[j];
        if (!effect.enabled) {
          continue;
        }
        const PostConstructor = effect.constructor as typeof PostProcessEffect;
        let effectInstance = this._postProcessEffectInstanceMap.get(PostConstructor);
        if (!effectInstance) {
          effectInstance = new PostConstructor(postProcess);
          effectInstance._setActive(true);
          this._postProcessEffectInstanceMap.set(PostConstructor, effectInstance);
        }

        // @todo: need `collider.ClosestPoint` to be implemented
        effect.lerp(effectInstance, 1);
      }
    }
  }

  private _initSwapRenderTarget(camera: Camera) {
    if (this._remainPassCount > 1) {
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
      this._currentDestRenderTarget = this._swapRenderTarget;
    } else {
      this._currentDestRenderTarget = this._destRenderTarget;
    }

    this._currentSourceRenderTarget = this._srcRenderTarget;
  }

  private _swapRT(): void {
    const currentSourceRenderTarget = this._currentSourceRenderTarget;
    const currentDestRenderTarget = this._currentDestRenderTarget;

    this._currentSourceRenderTarget = currentDestRenderTarget;

    if (this._remainPassCount > 1) {
      this._currentDestRenderTarget = currentSourceRenderTarget;
    } else {
      this._currentDestRenderTarget = this._destRenderTarget;
    }
  }

  private _getCurrentSourceTexture(): Texture2D {
    return this._currentSourceRenderTarget.getColorTexture(0) as Texture2D;
  }
}
