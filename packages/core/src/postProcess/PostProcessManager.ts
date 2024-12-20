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
  private _swapRenderTarget: RenderTarget;
  private _srcRenderTarget: RenderTarget;
  private _destRenderTarget: RenderTarget;
  private _currentSourceRenderTarget: RenderTarget;
  private _currentDestRenderTarget: RenderTarget;
  private _blendEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _defaultEffectMap = new Map<typeof PostProcessEffect, PostProcessEffect>();
  private _remainActivePassCount = 0;
  private _tempColliders: Collider[] = [];
  private _tempVector3 = new Vector3();

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {}

  /**
   * @internal
   * Whether has any valid post process pass.
   */
  _isValid(): boolean {
    const scene = this.scene;
    const engine = scene.engine;

    const activePasses = engine._getActivePostProcessPasses();
    return activePasses.some((pass) => pass.isValid(scene.postProcessManager));
  }

  /**
   * @internal
   */
  _update(camera: Camera): void {
    // Start by resetting post process effect instance to default values
    this._resetDefaultValue();

    // Sort post process
    this._sortActivePostProcess();
    const activePostProcesses = this._activePostProcesses;

    for (let i = 0, n = activePostProcesses.length; i < n; i++) {
      const postProcess = activePostProcesses[i];

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
        const cameraPosition = camera.entity.transform.worldPosition;
        const blendDistance = postProcess.blendDistance;

        let hasColliderShape = false;
        // Find closest distance to current postProcess, 0 means it's inside it
        let closestDistance = Number.POSITIVE_INFINITY;

        postProcess.entity.getComponents(Collider, currentColliders);
        for (let i = 0; i < currentColliders.length; i++) {
          const collider = currentColliders[i];
          if (!collider.enabled) {
            continue;
          }
          const shapes = collider.shapes;
          for (let j = 0; j < shapes.length; j++) {
            const currentShape = shapes[j];
            hasColliderShape = true;

            const distance = currentShape.getClosestPoint(cameraPosition, this._tempVector3);
            if (distance < closestDistance) {
              closestDistance = distance;
            }
          }
        }

        if (!hasColliderShape) {
          Logger.warn(
            `No collider shape found in the entity:"${postProcess.entity.name}", the local mode of post process will not take effect.`
          );
          continue;
        }

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

  /**
   * @internal
   */
  _addPostProcess(postProcess: PostProcess): void {
    this._activePostProcesses.push(postProcess);
    this._postProcessNeedSorting = true;
  }

  /**
   * @internal
   */
  _removePostProcess(postProcess: PostProcess): void {
    const index = this._activePostProcesses.indexOf(postProcess);
    if (index >= 0) {
      this._activePostProcesses.splice(index, 1);
      this._postProcessNeedSorting = true;
    }
  }

  /**
   * Get the blend effect by type.
   * @remarks
   * The blend effect is a post process effect that is used to blend all result of the effects by the type.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect instance found
   */
  getBlendEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    return this._blendEffectMap.get(type) as InstanceType<T>;
  }

  /**
   * @internal
   */
  _render(camera: Camera, srcRenderTarget: RenderTarget, destRenderTarget: RenderTarget): void {
    const engine = this.scene.engine;
    this._srcRenderTarget = srcRenderTarget;
    this._destRenderTarget = destRenderTarget;

    // Should blit to resolve the MSAA
    srcRenderTarget._blitRenderTarget();

    const activePasses = engine._getActivePostProcessPasses();
    this._remainActivePassCount = activePasses.length;
    this._initSwapRenderTarget(camera);

    for (let i = 0, n = activePasses.length; i < n; i++) {
      const pass = activePasses[i];
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
