import { EngineFeature, Engine, Scene } from "oasis-engine";
import Monitor from "./Monitor";

/**
 * Engine Feature: Display engine status data such as FPS.
 */
export class Stats extends EngineFeature {
  private monitor: Monitor;

  /**
   * Constructor of Stats.
   */
  constructor() {
    super();
  }

  /**
   * Tick pre-callback.
   */
  preTick(engine: Engine, currentScene: Scene): void {
    if (!this.monitor) {
      const gl = currentScene.engine._hardwareRenderer.gl;
      if (gl) {
        this.monitor = new Monitor(gl);
      }
    }
  }

  /**
   * Tick post-callback.
   */
  postTick(engine: Engine, currentScene: Scene): void {
    if (this.monitor) {
      this.monitor.update();
    }
  }
}
