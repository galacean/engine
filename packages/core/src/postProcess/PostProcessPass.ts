import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Scene } from "../Scene";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcessManager } from "./PostProcessManager";

export enum PostProcessPassEvent {
  BeforeUber = 0,
  AfterUber = 100
}

export abstract class PostProcessPass {
  /**
   * When the post process pass is rendered.
   */
  event = PostProcessPassEvent.AfterUber;

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

  constructor(public postProcessManager: PostProcessManager) {}

  /**
   * Called when the post process effect is rendered.
   * @param camera - The camera used to render
   * @param srcTexture - The source texture from last render target
   * @param destTarget - The destination render target
   */
  abstract onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void;
}
