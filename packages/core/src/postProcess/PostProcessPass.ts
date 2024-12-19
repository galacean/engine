import { EngineObject } from "../base";
import { Camera } from "../Camera";
import { RenderTarget, Texture2D } from "../texture";

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
      if (this._isActive) {
        this.engine._postProcessPassNeedSorting = true;
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
      this.engine._refreshActivePostProcessPasses();
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
    this.engine._removePostProcessPass(this);
  }
}
