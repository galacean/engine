import { Vector3 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { Scene } from "../Scene";
import { Logger } from "../base/Logger";
import { Material } from "../material";
import { Collider, ColliderShape } from "../physics";
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
  private _isActive = false;
  private _swapRenderTarget: RenderTarget;
  private _srcRenderTarget: RenderTarget;
  private _destRenderTarget: RenderTarget;
  private _currentSourceRenderTarget: RenderTarget;
  private _currentDestRenderTarget: RenderTarget;
  private _blendEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _defaultEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _remainActivePassCount = 0;
  private _tempColliders: Collider[] = [];
  private _tempColliderShapes: ColliderShape[] = [];
  private _tempVector3 = new Vector3();

  /**
   * Whether has any active pass and active effect.
   */
  get isActive(): boolean {
    if (!this._activeStateChangeFlag) {
      return this._isActive;
    }
    this._activeStateChangeFlag = false;

    this._isActive =
      this._activePostProcessPasses.length > 0 &&
      this._activePostProcesses.some(
        (postProcess) => postProcess.enabled && postProcess._effects.some((effect) => effect.enabled)
      );

    return this._isActive;
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
    return this._blendEffectMap.get(type) as InstanceType<T>;
  }

  /**
   * @internal
   */
  _render(camera: Camera, srcRenderTarget: RenderTarget, destRenderTarget: RenderTarget): void {
    this._srcRenderTarget = srcRenderTarget;
    this._destRenderTarget = destRenderTarget;

    // Should blit to resolve the MSAA
    srcRenderTarget._blitRenderTarget();

    this._update(camera);

    this._remainActivePassCount = this._activePostProcessPasses.length;
    this._initSwapRenderTarget(camera);

    for (let i = 0; i < this._activePostProcessPasses.length; i++) {
      const pass = this._activePostProcessPasses[i];
      pass.onRender(camera, this._getCurrentSourceTexture(), this._currentDestRenderTarget);
      this._remainActivePassCount--;
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
    this._blendEffectMap.forEach((blendEffect, typeofBlendEffect) => {
      let defaultEffect = this._defaultEffectMap.get(typeofBlendEffect);

      if (!defaultEffect) {
        defaultEffect = new typeofBlendEffect(null);
        this._defaultEffectMap.set(typeofBlendEffect, defaultEffect);
      }

      // Reset effectInstance's value by defaultEffect
      blendEffect.lerp(defaultEffect, 1);
      blendEffect.enabled = false;
    });
  }

  private _update(camera: Camera): void {
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

      if (!(camera.postProcessMask & postProcess.layer)) {
        continue;
      }

      const isGlobal = postProcess.isGlobal;
      let interpFactor = 1; // Global default value
      if (!isGlobal) {
        const currentColliders = this._tempColliders;
        const currentShapes = this._tempColliderShapes;
        currentShapes.length = 0;
        postProcess.entity.getComponentsIncludeChildren(Collider, currentColliders);
        for (let i = 0; i < currentColliders.length; i++) {
          const collider = currentColliders[i];
          if (!collider.enabled) {
            continue;
          }
          const shapes = collider.shapes;
          for (let j = 0; j < shapes.length; j++) {
            currentShapes.push(shapes[j]);
          }
        }

        if (!currentShapes.length) {
          Logger.warn(
            `No collider shape found in the entity:"${postProcess.entity.name}", the local mode of post process will not take effect.`
          );
          continue;
        }

        const cameraPosition = camera.entity.transform.worldPosition;
        // Find closest distance to current postProcess, 0 means it's inside it
        let closestDistance = Number.POSITIVE_INFINITY;
        for (let k = 0; k < currentShapes.length; k++) {
          const shape = currentShapes[k];
          const distance = shape.getClosestPoint(cameraPosition, this._tempVector3);
          if (distance < closestDistance) {
            closestDistance = distance;
          }
        }

        const blendDistance = postProcess.blendDistance;
        // Post process has no influence, ignore it
        if (closestDistance > blendDistance) {
          continue;
        }

        if (blendDistance > 0) {
          interpFactor = 1 - closestDistance / blendDistance;
        }
      }

      const effects = postProcess._effects;
      for (let j = 0; j < effects.length; j++) {
        const effect = effects[j];
        if (!effect.enabled) {
          continue;
        }
        const PostConstructor = effect.constructor as typeof PostProcessEffect;
        let blendEffect = this._blendEffectMap.get(PostConstructor);
        if (!blendEffect) {
          blendEffect = new PostConstructor(null);
          this._blendEffectMap.set(PostConstructor, blendEffect);
        }

        blendEffect.lerp(effect, interpFactor);
        blendEffect.enabled = true;
      }
    }
  }

  private _initSwapRenderTarget(camera: Camera): void {
    if (this._remainActivePassCount > 1) {
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

    if (this._remainActivePassCount > 1) {
      this._currentDestRenderTarget = currentSourceRenderTarget;
    } else {
      this._currentDestRenderTarget = this._destRenderTarget;
    }
  }

  private _getCurrentSourceTexture(): Texture2D {
    return this._currentSourceRenderTarget.getColorTexture(0) as Texture2D;
  }
}
