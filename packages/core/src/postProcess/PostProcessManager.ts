import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { Scene } from "../Scene";
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
  /** @internal */
  _activeStateChangeFlag = false;

  private _postProcessPasses: PostProcessPass[] = [];
  private _activePostProcesses: PostProcess[] = [];
  private _activePostProcessPasses: PostProcessPass[] = [];
  private _hasActiveEffect = false;
  private _swapRenderTarget: RenderTarget;
  private _srcRenderTarget: RenderTarget;
  private _destRenderTarget: RenderTarget;
  private _currentSourceRenderTarget: RenderTarget;
  private _currentDestRenderTarget: RenderTarget;
  private _blendPostProcessEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _defaultPostProcessEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _remainPassCount = 0;

  /**
   * Whether has any active pass and active effect.
   */
  get isActive(): boolean {
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
   * Get all post process passes.
   */
  get postProcessPasses(): ReadonlyArray<PostProcessPass> {
    return this._postProcessPasses;
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
  addPostProcessPass(pass: PostProcessPass): void {
    if (pass.engine !== this.scene.engine) {
      throw "The pass is not belong to this engine.";
    }

    const passes = this._postProcessPasses;
    const index = passes.indexOf(pass);

    if (index === -1) {
      pass._postProcessManager?._removePostProcessPass(pass);
      pass._postProcessManager = this;
      passes.push(pass);

      pass.isActive && this._refreshActivePostProcessPasses();
    }
  }

  /**
   * @internal
   */
  _removePostProcessPass(pass: PostProcessPass): void {
    const passes = this._postProcessPasses;
    const index = passes.indexOf(pass);

    if (index !== -1) {
      passes.splice(index, 1);
      pass._postProcessManager = null;

      pass.isActive && this._refreshActivePostProcessPasses();
    }
  }

  /**
   * @internal
   */
  _refreshActivePostProcessPasses(): void {
    const activePostProcesses = this._activePostProcessPasses;
    activePostProcesses.length = 0;

    for (let i = 0; i < this._postProcessPasses.length; i++) {
      const pass = this._postProcessPasses[i];
      if (pass.isActive) {
        activePostProcesses.push(pass);
      }
    }

    this._activeStateChangeFlag = true;
    this._postProcessPassNeedSorting = true;
  }

  /**
   * @internal
   */
  _addPostProcess(postProcess: PostProcess): void {
    this._activePostProcesses.push(postProcess);
    this._activeStateChangeFlag = true;
    this._postProcessNeedSorting = true;
  }

  /**
   * @internal
   */
  _removePostProcess(postProcess: PostProcess): void {
    const index = this._activePostProcesses.indexOf(postProcess);
    if (index >= 0) {
      this._activePostProcesses.splice(index, 1);
      this._activeStateChangeFlag = true;
      this._postProcessNeedSorting = true;
    }
  }

  /**
   * @internal
   */
  _getBlendEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    return this._blendPostProcessEffectMap.get(type) as InstanceType<T>;
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
  _releaseSwapRenderTarget(): void {
    const swapRenderTarget = this._swapRenderTarget;
    if (swapRenderTarget) {
      swapRenderTarget.getColorTexture(0)?.destroy(true);
      swapRenderTarget.destroy(true);
      this._swapRenderTarget = null;
    }
  }

  private _sortActivePostProcessPass(): void {
    if (this._postProcessPassNeedSorting) {
      const passes = this._activePostProcessPasses;
      if (passes.length) {
        passes.sort((a, b) => a.event - b.event);
      }
      this._postProcessPassNeedSorting = false;
    }
  }

  private _sortActivePostProcess(): void {
    if (this._postProcessNeedSorting) {
      const postProcesses = this._activePostProcesses;
      if (postProcesses.length) {
        postProcesses.sort((a, b) => a.priority - b.priority);
      }
      this._postProcessNeedSorting = false;
    }
  }

  private _resetDefaultValue(): void {
    this._blendPostProcessEffectMap.forEach((effectInstance, typeofEffectInstance) => {
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

  private _update(postProcessMask: Layer): void {
    // Start by resetting post process effect instance to default values
    this._resetDefaultValue();

    // Sort post process and post process pass
    this._sortActivePostProcess();
    this._sortActivePostProcessPass();

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
        let effectInstance = this._blendPostProcessEffectMap.get(PostConstructor);
        if (!effectInstance) {
          effectInstance = new PostConstructor(postProcess);
          effectInstance._setActive(true);
          this._blendPostProcessEffectMap.set(PostConstructor, effectInstance);
        }

        // @todo: need `collider.ClosestPoint` to be implemented
        effect.lerp(effectInstance, 1);
      }
    }
  }

  private _initSwapRenderTarget(camera: Camera): void {
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
