import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Scene } from "../Scene";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcessManager } from "./PostProcessManager";

/**
 * Controls when the post process pass executes.
 * @remarks
 * Users can also inject pass events in a specific point by doing PostProcessPassEvent + offset.
 */
export enum PostProcessPassEvent {
  BeforeUber = 0,
  AfterUber = 100
}

export abstract class PostProcessPass {
  private _event = PostProcessPassEvent.AfterUber;

  /**
   * When the post process pass is rendered.
   */
  get event(): number {
    return this._event;
  }

  set event(value: number) {
    this._event = value;
    this.scene.postProcessManager._postProcessPassNeedSorting = true;
  }

  /**
   * Whether the post process pass is active.
   */
  isActive = true;

  get scene(): Scene {
    return this.postProcessManager.scene;
  }

  get engine(): Engine {
    return this.postProcessManager.scene.engine;
  }

  /**
   * Create a post process pass.
   * @param postProcessManager - The post process manager being used
   */
  constructor(public postProcessManager: PostProcessManager) {}

  /**
   * Execute the post process pass if it is active.
   * @param camera - The camera used to render
   * @param srcTexture - The source texture from last render target
   * @param destTarget - The destination render target
   */
  abstract onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void;
}
