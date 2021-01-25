import { Engine } from "./Engine";
import { Scene } from "./Scene";

/**
 * Engine feature plug-in.
 * @deprecated
 */
export class EngineFeature {
  /**
   * Callback before the engine main loop runs,used to load resource.
   * @param engine - Engine
   */
  public preLoad(engine: Engine): void {}

  /**
   * Callback before every engine tick.
   * @param engine - Engine
   * @param currentScene - Scene
   */
  public preTick(engine: Engine, currentScene: Scene): void {}

  /**
   * Callback after every engine tick.
   * @param  engine - Engine
   */
  public postTick(engine: Engine, currentScene: Scene): void {}

  /**
   * Callback after the engine is destroyed.
   * @param engine - Engine
   */
  public shutdown(engine: Engine): void {}
}
