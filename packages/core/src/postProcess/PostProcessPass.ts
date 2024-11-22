import { EngineObject } from "../base";
import { Camera } from "../Camera";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcessEffect } from "./PostProcessEffect";
import { PostProcessManager } from "./PostProcessManager";

/**
 * Controls when the post process pass executes.
 */
export enum PostProcessPassEvent {
  BeforeUber = 0,
  AfterUber = 100
}

export abstract class PostProcessPass extends EngineObject {
  private _event = PostProcessPassEvent.AfterUber;
  private _isActive = true;

  /**
   * @internal
   */
  _postProcessManager: PostProcessManager;

  /**
   * When the post process pass is rendered.
   * @remarks
   * Users can also inject pass events in a specific point by doing PostProcessPassEvent + offset.
   */
  get event(): PostProcessPassEvent {
    return this._event;
  }

  set event(value: PostProcessPassEvent) {
    if (value !== this._event) {
      this._event = value;
      if (this._postProcessManager) {
        this._postProcessManager._postProcessPassNeedSorting = true;
      }
    }
  }

  /**
   * Whether the post process pass is active.
   */
  get isActive(): boolean {
    return this._isActive;
  }

  set isActive(value: boolean) {
    if (value !== this._isActive) {
      this._isActive = value;
      if (value) {
        this._postProcessManager?.addPostProcessPass(this);
      } else {
        this._postProcessManager?._removePostProcessPass(this);
      }
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
    if (this._postProcessManager) {
      return this._postProcessManager._getBlendEffect(type);
    }
  }

  /**
   * Execute the post process pass if it is active.
   * @param camera - The camera used to render
   * @param srcTexture - The source texture from last render target
   * @param destTarget - The destination render target
   */
  abstract onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void;

  /**
   * @inheritdoc
   */
  override _onDestroy() {
    super._onDestroy();
    this._postProcessManager?._removePostProcessPass(this);
    this._postProcessManager = null;
  }
}
